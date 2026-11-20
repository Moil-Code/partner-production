-- ============================================
-- LICENCE ISSUE THROUGH THE OUTBOX (PP-LICENSE-1)
-- Run this in the Supabase SQL Editor (partner project) AFTER
-- database/add_outbox.sql, and before the partner app change that calls
-- issue_licenses. Safe to run twice. Until it is applied the add routes keep
-- inserting exactly as before (they fall back on "function not found").
-- ============================================
-- Before: /api/licenses/add and /add-multiple counted the team's seats, then
-- inserted (two concurrent adds could both pass the count and over-allocate),
-- then called the main API's activate_license, then sent a Resend email, all
-- inside the request. A crash after the insert left a seat with no plan in
-- Moil and no email; a failed activation was swallowed and still sent the
-- "register" email.
--
-- issue_licenses does, in ONE transaction:
--   1. lock the team row (FOR UPDATE) and re-check the seats against the
--      licences that exist now (the over-allocation race is gone);
--   2. lock each email (transaction advisory lock) and refuse one that already
--      holds a base licence (the duplicate-email race is gone);
--   3. insert the licences with the ids the route generated;
--   4. emit two outbox events per licence, both with ordering_key
--      'license:<id>': license.activate, then license.email. The drain never
--      runs the email while the activation is still pending.
--
-- Each row carries `sender` ('legacy' or 'outbox'), decided by the route once
-- (mode + canary, keyed on the licence id) and stored on the event payload.
-- 'legacy': the route still activates and emails inline; the drain only
-- checks the route finished (shadow). 'outbox': the route does neither; the
-- drain is the only sender.
--
-- New licence columns, written by the drain's activation step so the email
-- step knows which email to send:
--   moil_license_status  the main API's answer (activated, pending_invite,
--                        already_assigned, blocked_downgrade)
--   moil_has_account     true when the person has a Moil account but no
--                        employer profile yet
--   moil_activation_at   when the main API answered
-- ============================================

ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS moil_license_status TEXT,
  ADD COLUMN IF NOT EXISTS moil_has_account    BOOLEAN,
  ADD COLUMN IF NOT EXISTS moil_activation_at  TIMESTAMPTZ;

-- Answers jsonb:
--   { "status": "ok", "licenses": [{ id, email, created_at, is_activated }] }
--   { "status": "no_seats", "available": <int> }
--   { "status": "exists", "emails": [...] }
-- Raises 22023 on malformed input.
CREATE OR REPLACE FUNCTION public.issue_licenses(
  p_admin_id   UUID,
  p_team_id    UUID,
  p_partner_id UUID,
  p_rows       JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count     INTEGER;
  v_purchased INTEGER;
  v_assigned  INTEGER;
  v_emails    TEXT[];
  v_existing  TEXT[];
  v_email     TEXT;
  v_row       JSONB;
  v_id        UUID;
  v_sender    TEXT;
  v_out       JSONB := '[]'::jsonb;
  v_lic       RECORD;
BEGIN
  IF p_admin_id IS NULL THEN
    RAISE EXCEPTION 'admin id is required' USING ERRCODE = '22023';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'rows must be an array' USING ERRCODE = '22023';
  END IF;
  v_count := jsonb_array_length(p_rows);
  IF v_count < 1 OR v_count > 1000 THEN
    RAISE EXCEPTION 'between 1 and 1000 rows' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    IF COALESCE(v_row->>'email', '') NOT LIKE '%@%'
       OR (v_row->>'id') IS NULL
       OR COALESCE(v_row->>'sender', '') NOT IN ('legacy', 'outbox') THEN
      RAISE EXCEPTION 'malformed row' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT array_agg(DISTINCT lower(r->>'email') ORDER BY lower(r->>'email'))
    INTO v_emails
    FROM jsonb_array_elements(p_rows) r;

  -- 1. Seats, under a lock on the team row. Concurrent issues for the same
  --    team queue here; each sees the licences the previous one committed.
  --    No team (or a team row that does not exist) = no seat check, as the
  --    routes did before.
  IF p_team_id IS NOT NULL THEN
    SELECT purchased_license_count INTO v_purchased
      FROM public.teams WHERE id = p_team_id
       FOR UPDATE;
    IF FOUND THEN
      SELECT COUNT(*) INTO v_assigned
        FROM public.licenses
       WHERE team_id = p_team_id AND grant_kind = 'base';
      IF v_assigned + v_count > COALESCE(v_purchased, 0) THEN
        RETURN jsonb_build_object('status', 'no_seats',
                                  'available', COALESCE(v_purchased, 0) - v_assigned);
      END IF;
    END IF;
  END IF;

  -- 2. One base licence per email, globally. Sorted order: no deadlocks
  --    between two batches sharing emails.
  FOREACH v_email IN ARRAY v_emails LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('license-email:' || v_email, 0));
  END LOOP;
  SELECT array_agg(DISTINCT lower(email)) INTO v_existing
    FROM public.licenses
   WHERE lower(email) = ANY(v_emails) AND grant_kind = 'base';
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'exists', 'emails', to_jsonb(v_existing));
  END IF;

  -- 3 + 4. Insert and emit.
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_id := (v_row->>'id')::UUID;
    v_sender := v_row->>'sender';

    INSERT INTO public.licenses (
      id, admin_id, email, business_name, business_type, is_activated,
      team_id, performed_by, grant_kind, plan_tier, billing_cycle, months
    ) VALUES (
      v_id, p_admin_id, lower(v_row->>'email'), '', '', FALSE,
      p_team_id, p_admin_id, 'base',
      v_row->>'plan_tier', v_row->>'billing_cycle', NULLIF(v_row->>'months', '')::INTEGER
    )
    RETURNING id, email, created_at, is_activated INTO v_lic;

    PERFORM public.outbox_emit(
      'license.activate', 'license', v_id::TEXT, p_partner_id,
      jsonb_build_object('license_id', v_id, 'sender', v_sender,
                         'plan', v_row->>'plan_tier', 'billing_cycle', v_row->>'billing_cycle',
                         'months', NULLIF(v_row->>'months', '')::INTEGER),
      'license.activate:' || v_id::TEXT,
      'license:' || v_id::TEXT);
    PERFORM public.outbox_emit(
      'license.email', 'license', v_id::TEXT, p_partner_id,
      jsonb_build_object('license_id', v_id, 'sender', v_sender),
      'license.email:' || v_id::TEXT,
      'license:' || v_id::TEXT);

    v_out := v_out || jsonb_build_object(
      'id', v_lic.id, 'email', v_lic.email,
      'created_at', v_lic.created_at, 'is_activated', v_lic.is_activated);
  END LOOP;

  RETURN jsonb_build_object('status', 'ok', 'licenses', v_out);
END;
$$;

REVOKE ALL ON FUNCTION public.issue_licenses(UUID, UUID, UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_licenses(UUID, UUID, UUID, JSONB)
  TO service_role;

NOTIFY pgrst, 'reload schema';
