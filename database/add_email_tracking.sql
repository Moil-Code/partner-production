-- ============================================
-- EMAIL TRACKING (Resend webhooks)
-- Run this in Supabase SQL Editor
-- ============================================
-- Before this, the only record of an email was licenses.message_id (the LAST
-- message sent for a seat) and licenses.email_status (its last_event, pulled
-- on demand). A resend overwrote both, reminders were not recorded at all, and
-- "opened" was whatever Resend said the moment someone pressed Refresh.
--
--   license_emails  one row per email we sent about a seat (activation, claim,
--                   activated, reminder) with its delivery/open/click history.
--                   Written by the app at send time (record_license_emails).
--   email_events    the raw webhook log, one row per Resend delivery. Its
--                   svix_id is unique: Resend retries a delivery until it gets
--                   a 2xx, and counting a retry twice would double opens.
--
-- Events and sends can arrive in either order — Resend's email.sent and
-- email.delivered often land within a second or two, before the send route
-- has written its row. So both writers converge:
--   - apply_resend_event logs the event, and applies it if the send row
--     exists (or can be found through licenses.message_id, which covers mail
--     sent before this migration);
--   - record_license_emails inserts the send row and replays any events that
--     were logged for it first.
-- ============================================

CREATE TABLE IF NOT EXISTS public.license_emails (
  message_id        TEXT PRIMARY KEY,                 -- Resend email id
  license_id        UUID NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL DEFAULT 'activation'
                    CHECK (kind IN ('activation', 'claim', 'activated', 'reminder')),
  recipient         TEXT,
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Furthest stage reached (see public.email_event_rank), not the latest
  -- event: an 'opened' followed by a late 'delivered' must stay 'opened'.
  last_event        TEXT NOT NULL DEFAULT 'sent',
  delivered_at      TIMESTAMPTZ,
  first_opened_at   TIMESTAMPTZ,
  last_opened_at    TIMESTAMPTZ,
  open_count        INTEGER NOT NULL DEFAULT 0,
  first_clicked_at  TIMESTAMPTZ,
  click_count       INTEGER NOT NULL DEFAULT 0,
  bounced_at        TIMESTAMPTZ,
  bounce_reason     TEXT,
  complained_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_license_emails_license
  ON public.license_emails (license_id, sent_at DESC);

CREATE TABLE IF NOT EXISTS public.email_events (
  id           BIGSERIAL PRIMARY KEY,
  svix_id      TEXT NOT NULL UNIQUE,
  message_id   TEXT,
  event_type   TEXT NOT NULL,          -- 'delivered', 'opened', ... ('email.' stripped)
  recipient    TEXT,
  occurred_at  TIMESTAMPTZ NOT NULL,
  payload      JSONB,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_events_message
  ON public.email_events (message_id, occurred_at);

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Only the service role writes either table (webhook + send routes).
-- license_emails is readable by whoever can read the license: the EXISTS runs
-- under the caller's own licenses RLS, so partner/team scoping is inherited
-- rather than restated (and cannot drift from it).
ALTER TABLE public.license_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_events   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS license_emails_select ON public.license_emails;
CREATE POLICY license_emails_select ON public.license_emails
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.licenses l WHERE l.id = license_emails.license_id));

-- The raw log holds every recipient address, including non-license mail.
DROP POLICY IF EXISTS email_events_select ON public.email_events;
CREATE POLICY email_events_select ON public.email_events
  FOR SELECT TO authenticated
  USING (public.is_moil_admin(auth.uid()));

-- ── Ranking ──────────────────────────────────────────────────────────────
-- Mirrors emailFunnelStage() in lib/emailStatus.ts. Undeliverable outranks
-- everything: a spam complaint after an open is the thing to know.
CREATE OR REPLACE FUNCTION public.email_event_rank(p_event TEXT)
RETURNS INTEGER
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_event
    WHEN 'sent' THEN 1
    WHEN 'delivery_delayed' THEN 1
    WHEN 'delivered' THEN 2
    WHEN 'opened' THEN 3
    WHEN 'clicked' THEN 4
    WHEN 'bounced' THEN 5
    WHEN 'complained' THEN 5
    WHEN 'suppressed' THEN 5
    WHEN 'failed' THEN 5
    ELSE 0
  END;
$$;

-- ── Apply one event to its send row (and the license's email_status) ─────
CREATE OR REPLACE FUNCTION public._apply_email_event(
  p_message_id  TEXT,
  p_event_type  TEXT,
  p_recipient   TEXT,
  p_occurred_at TIMESTAMPTZ,
  p_payload     JSONB
) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_license_id UUID;
BEGIN
  UPDATE public.license_emails SET
    last_event = CASE
      WHEN public.email_event_rank(p_event_type) >= public.email_event_rank(last_event)
      THEN p_event_type ELSE last_event END,
    delivered_at = CASE WHEN p_event_type = 'delivered'
      THEN LEAST(COALESCE(delivered_at, p_occurred_at), p_occurred_at) ELSE delivered_at END,
    first_opened_at = CASE WHEN p_event_type = 'opened'
      THEN LEAST(COALESCE(first_opened_at, p_occurred_at), p_occurred_at) ELSE first_opened_at END,
    last_opened_at = CASE WHEN p_event_type = 'opened'
      THEN GREATEST(COALESCE(last_opened_at, p_occurred_at), p_occurred_at) ELSE last_opened_at END,
    open_count = open_count + CASE WHEN p_event_type = 'opened' THEN 1 ELSE 0 END,
    first_clicked_at = CASE WHEN p_event_type = 'clicked'
      THEN LEAST(COALESCE(first_clicked_at, p_occurred_at), p_occurred_at) ELSE first_clicked_at END,
    click_count = click_count + CASE WHEN p_event_type = 'clicked' THEN 1 ELSE 0 END,
    bounced_at = CASE WHEN p_event_type IN ('bounced', 'suppressed', 'failed')
      THEN COALESCE(bounced_at, p_occurred_at) ELSE bounced_at END,
    bounce_reason = CASE WHEN p_event_type IN ('bounced', 'suppressed', 'failed')
      THEN COALESCE(
        p_payload #>> '{data,bounce,message}',
        p_payload #>> '{data,failed,reason}',
        p_payload #>> '{data,suppressed,message}',
        bounce_reason)
      ELSE bounce_reason END,
    complained_at = CASE WHEN p_event_type = 'complained'
      THEN COALESCE(complained_at, p_occurred_at) ELSE complained_at END
  WHERE message_id = p_message_id
  RETURNING license_id INTO v_license_id;

  IF v_license_id IS NULL THEN
    RETURN;
  END IF;

  -- Keep licenses.email_status (what the partner dashboard and the reminder
  -- cron read) moving forward too. Two guards:
  --   - only while it holds an outbound/undeliverable state, so 'skipped',
  --     'pending' and 'not_applicable' are never overwritten;
  --   - only for the address the seat is on NOW. After update-email, a late
  --     bounce from the old address must not mark the new one undeliverable.
  UPDATE public.licenses l SET email_status = p_event_type
  WHERE l.id = v_license_id
    AND (p_recipient IS NULL OR lower(l.email) = lower(p_recipient))
    AND l.email_status IN ('sent', 'delivery_delayed', 'delivered', 'opened', 'clicked',
                           'bounced', 'complained', 'suppressed')
    AND public.email_event_rank(p_event_type) > public.email_event_rank(l.email_status);
END;
$$;

-- ── Webhook entry point ──────────────────────────────────────────────────
-- Returns 'duplicate' (already logged), 'applied', or 'unmatched' (not a
-- license email we know of, e.g. a team invite — logged, nothing else).
CREATE OR REPLACE FUNCTION public.apply_resend_event(
  p_svix_id     TEXT,
  p_message_id  TEXT,
  p_event_type  TEXT,
  p_recipient   TEXT,
  p_occurred_at TIMESTAMPTZ,
  p_payload     JSONB
) RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  v_license public.licenses%ROWTYPE;
BEGIN
  INSERT INTO public.email_events (svix_id, message_id, event_type, recipient, occurred_at, payload)
  VALUES (p_svix_id, p_message_id, p_event_type, lower(p_recipient), p_occurred_at, p_payload)
  ON CONFLICT (svix_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN 'duplicate';
  END IF;

  IF p_message_id IS NULL THEN
    RETURN 'unmatched';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.license_emails WHERE message_id = p_message_id) THEN
    -- Mail sent before this migration (or whose send-row write failed) is
    -- still findable through the seat's current message_id.
    SELECT * INTO v_license FROM public.licenses WHERE message_id = p_message_id LIMIT 1;
    IF v_license.id IS NULL THEN
      RETURN 'unmatched';
    END IF;
    INSERT INTO public.license_emails (message_id, license_id, kind, recipient, sent_at)
    VALUES (p_message_id, v_license.id, 'activation', lower(v_license.email),
            COALESCE(v_license.activation_email_sent_at, v_license.created_at))
    ON CONFLICT (message_id) DO NOTHING;
  END IF;

  PERFORM public._apply_email_event(p_message_id, p_event_type, lower(p_recipient), p_occurred_at, p_payload);
  RETURN 'applied';
END;
$$;

-- ── Send-time recorder ───────────────────────────────────────────────────
-- p_rows: [{ "message_id", "license_id", "kind", "recipient" }, ...]
-- Replays any events Resend delivered before this row existed. A row that
-- already exists (the webhook found it first via licenses.message_id) only
-- has its kind/recipient corrected — its events were applied then.
CREATE OR REPLACE FUNCTION public.record_license_emails(p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  r JSONB;
  e RECORD;
  v_inserted INTEGER := 0;
  v_fresh BOOLEAN;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    INSERT INTO public.license_emails (message_id, license_id, kind, recipient)
    VALUES (r->>'message_id', (r->>'license_id')::UUID, COALESCE(r->>'kind', 'activation'),
            lower(r->>'recipient'))
    ON CONFLICT (message_id) DO UPDATE
      SET kind = EXCLUDED.kind, recipient = COALESCE(EXCLUDED.recipient, license_emails.recipient)
    -- xmax = 0 only for a freshly inserted row, not one taken by DO UPDATE.
    RETURNING (xmax = 0) INTO v_fresh;

    IF v_fresh THEN
      v_inserted := v_inserted + 1;
      FOR e IN
        SELECT event_type, recipient, occurred_at, payload FROM public.email_events
        WHERE message_id = r->>'message_id' ORDER BY occurred_at
      LOOP
        PERFORM public._apply_email_event(r->>'message_id', e.event_type, e.recipient, e.occurred_at, e.payload);
      END LOOP;
    END IF;
  END LOOP;
  RETURN v_inserted;
END;
$$;

-- Writers are server-side only (service role). Nobody signed in calls these.
REVOKE ALL ON FUNCTION public._apply_email_event(TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_resend_event(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_license_emails(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._apply_email_event(TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_resend_event(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_license_emails(JSONB) TO service_role;

-- ── Per-seat rollup for dashboards ───────────────────────────────────────
-- security_invoker: the view runs under the CALLER's RLS, not the owner's,
-- so it can never show a partner another partner's seats.
DROP VIEW IF EXISTS public.license_email_stats;
CREATE VIEW public.license_email_stats
WITH (security_invoker = true) AS
SELECT
  le.license_id,
  l.admin_id,
  l.partner_id,
  COUNT(*)::INTEGER                                   AS sends,
  MAX(le.sent_at)                                     AS last_sent_at,
  MIN(le.delivered_at)                                AS first_delivered_at,
  MIN(le.first_opened_at)                             AS first_opened_at,
  MAX(le.last_opened_at)                              AS last_opened_at,
  SUM(le.open_count)::INTEGER                         AS opens,
  MIN(le.first_clicked_at)                            AS first_clicked_at,
  SUM(le.click_count)::INTEGER                        AS clicks,
  -- Only the address the seat is on now: a bounce from before an email
  -- correction is history, not a reason to flag the seat.
  MAX(le.bounced_at)    FILTER (WHERE le.recipient IS NULL OR le.recipient = lower(l.email)) AS bounced_at,
  MAX(le.complained_at) FILTER (WHERE le.recipient IS NULL OR le.recipient = lower(l.email)) AS complained_at,
  (ARRAY_AGG(le.bounce_reason ORDER BY le.bounced_at DESC NULLS LAST))[1] AS bounce_reason
FROM public.license_emails le
JOIN public.licenses l ON l.id = le.license_id
GROUP BY le.license_id, l.admin_id, l.partner_id;

GRANT SELECT ON public.license_email_stats TO authenticated;
