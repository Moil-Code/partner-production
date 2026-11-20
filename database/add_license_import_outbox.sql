-- ============================================
-- CSV LICENCE IMPORT THROUGH THE OUTBOX (PP-LICENSE-2)
-- Run this in the Supabase SQL Editor (partner project) AFTER
-- database/add_outbox.sql and database/add_license_issue_outbox.sql (it uses
-- outbox_emit and the moil_* licence columns). Safe to run twice. Until it is
-- applied /api/licenses/import inserts exactly as before (it falls back on
-- "function not found").
-- ============================================
-- Before: /api/licenses/import counted seats, then (only when the caller sent
-- plan defaults) called the main API's activate_license for every email, then
-- inserted all rows, then batch-sent the activation ("register") email to
-- every row the main API did not answer 'activated'. Two concurrent imports
-- could both pass the seat count, and a crash between the insert and the
-- email left seats nobody was ever told about.
--
-- issue_import_licenses does, in ONE transaction:
--   1. lock the team row (FOR UPDATE) and re-check the seats;
--   2. lock each email (advisory) and refuse one that already holds a base
--      licence;
--   3. insert the rows with the ids the route generated (a 'legacy' row
--      carries what the route's inline activation already answered:
--      is_activated, moil_user_id, expires_at, the resolved plan);
--   4. emit per licence, ordering_key 'license:<id>':
--        license.activate     (payload.flow = 'import'), only when the import
--                             carries plan defaults (the partner CSV import
--                             does not, and today never activates);
--        license.import_email the import's own email: the activation
--                             ("register") email, unless the main API
--                             answered 'activated'. Exactly what the route
--                             sends today.
--
-- Each row carries `sender` ('legacy' or 'outbox'), decided by the route once
-- (LICENSE_IMPORT_OUTBOX + _CANARY, keyed on the licence id) and stored on
-- the payloads. 'legacy': the route activates and emails inline; the drain
-- only checks the route finished. 'outbox': the drain is the only sender.
-- `expects_email` (legacy rows only) says whether the route will email, so
-- the shadow check of a row the route deliberately did not email ('activated')
-- does not wait for an email_status that never comes.
--
-- Payloads carry ids, enums and booleans only: never an address.
-- ============================================

-- Answers jsonb, like issue_licenses:
--   { "status": "ok", "licenses": [{ id, email, created_at, is_activated }] }
--   { "status": "no_seats", "available": <int> }
--   { "status": "exists", "emails": [...] }
-- Raises 22023 on malformed input.
CREATE OR REPLACE FUNCTION public.issue_import_licenses(
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
  v_needs     BOOLEAN;
  v_expects   BOOLEAN;
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
       OR COALESCE(v_row->>'sender', '') NOT IN ('legacy', 'outbox')
       OR jsonb_typeof(v_row->'needs_activation') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(v_row->'expects_email') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'malformed row' USING ERRCODE = '22023';
    END IF;
    -- An outbox row is activated (if at all) by the drain, never pre-filled.
    IF v_row->>'sender' = 'outbox' AND COALESCE((v_row->>'is_activated')::BOOLEAN, FALSE) THEN
      RAISE EXCEPTION 'malformed row' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT array_agg(DISTINCT lower(r->>'email') ORDER BY lower(r->>'email'))
    INTO v_emails
    FROM jsonb_array_elements(p_rows) r;

  -- 1. Seats, under a lock on the team row (the same lock issue_licenses
  --    takes, so an import and an add for one team queue behind each other).
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

  -- 2. One base licence per email, globally (same advisory lock name as
  --    issue_licenses). Sorted order: no deadlocks.
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
    v_id      := (v_row->>'id')::UUID;
    v_sender  := v_row->>'sender';
    v_needs   := (v_row->>'needs_activation')::BOOLEAN;
    v_expects := (v_row->>'expects_email')::BOOLEAN;

    INSERT INTO public.licenses (
      id, admin_id, email, business_name, business_type, is_activated,
      team_id, performed_by, grant_kind, plan_tier, billing_cycle, months,
      moil_user_id, expires_at
    ) VALUES (
      v_id, p_admin_id, lower(v_row->>'email'), '', '',
      COALESCE((v_row->>'is_activated')::BOOLEAN, FALSE),
      p_team_id, p_admin_id, 'base',
      v_row->>'plan_tier', v_row->>'billing_cycle', NULLIF(v_row->>'months', '')::INTEGER,
      NULLIF(v_row->>'moil_user_id', ''), NULLIF(v_row->>'expires_at', '')::TIMESTAMPTZ
    )
    RETURNING id, email, created_at, is_activated INTO v_lic;

    IF v_needs THEN
      PERFORM public.outbox_emit(
        'license.activate', 'license', v_id::TEXT, p_partner_id,
        jsonb_build_object('license_id', v_id, 'sender', v_sender, 'flow', 'import',
                           'expects_email', v_expects,
                           'plan', v_row->>'plan_tier', 'billing_cycle', v_row->>'billing_cycle',
                           'months', NULLIF(v_row->>'months', '')::INTEGER),
        'license.activate:' || v_id::TEXT,
        'license:' || v_id::TEXT);
    END IF;
    PERFORM public.outbox_emit(
      'license.import_email', 'license', v_id::TEXT, p_partner_id,
      jsonb_build_object('license_id', v_id, 'sender', v_sender,
                         'needs_activation', v_needs, 'expects_email', v_expects),
      'license.import_email:' || v_id::TEXT,
      'license:' || v_id::TEXT);

    v_out := v_out || jsonb_build_object(
      'id', v_lic.id, 'email', v_lic.email,
      'created_at', v_lic.created_at, 'is_activated', v_lic.is_activated);
  END LOOP;

  RETURN jsonb_build_object('status', 'ok', 'licenses', v_out);
END;
$$;

REVOKE ALL ON FUNCTION public.issue_import_licenses(UUID, UUID, UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_import_licenses(UUID, UUID, UUID, JSONB)
  TO service_role;

NOTIFY pgrst, 'reload schema';
