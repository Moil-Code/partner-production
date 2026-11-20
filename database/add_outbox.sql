-- ============================================
-- TRANSACTIONAL OUTBOX (foundation)
-- Run this in the Supabase SQL Editor (partner project), BEFORE
-- database/add_license_issue_outbox.sql and before deploying the partner app
-- change that drains it. Safe to run twice.
-- ============================================
-- Why: side effects (main-API licence activation, Resend emails) used to run
-- inside the request that wrote the row. A crash, a timeout or a Vercel
-- function kill between the write and the call lost the effect for good.
-- Now the business write and an outbox row are committed in ONE transaction,
-- and POST /api/outbox/drain (called every minute by the VPS cron with the
-- internal key) performs the effect, retrying with backoff.
--
--   outbox_events      one row per effect to perform. idempotency_key is
--                      unique, so a retried write never doubles an event.
--                      payload holds ids and enums only: no email address,
--                      name, text or token.
--   outbox_emit        insert ... on conflict (idempotency_key) do nothing.
--                      Called from inside other SECURITY DEFINER functions in
--                      the same transaction as the business write.
--   outbox_claim       lease up to p_batch due rows (FOR UPDATE SKIP LOCKED,
--                      so two drains take disjoint rows). A row is skipped
--                      while an older pending row with the same ordering_key
--                      exists (so a licence's email never runs before its
--                      activation). Older = lower seq, not created_at: rows
--                      emitted in one transaction share created_at.
--   outbox_settle      only the current lease holder may settle. delivered,
--                      retry (backoff 10 s * 3^(attempts-1), +/-20% jitter,
--                      capped at 6 h; dead once attempts >= max) or dead.
--   outbox_health      per event_type: pending, oldest pending age, dead,
--                      delivered in the last hour.
--   outbox_prune       delete delivered/cancelled rows older than 14 days and
--                      dead rows older than 1 year, 5000 at a time.
--   outbox_replay      reset dead/cancelled rows to pending (never re-inserts;
--                      the idempotency key is kept). Logged with who.
--   outbox_cancel      set pending (unleased) rows cancelled. Logged with who.
--
-- Everything is service-role only: RLS on with no policies, and every
-- function revoked from PUBLIC, anon and authenticated.
-- ============================================

CREATE TABLE IF NOT EXISTS public.outbox_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Insertion order. Used for per-key ordering and claim order: created_at is
  -- the transaction time, identical for every row of one transaction.
  seq             BIGINT GENERATED ALWAYS AS IDENTITY,
  event_type      TEXT        NOT NULL CHECK (length(event_type) BETWEEN 1 AND 100),
  event_version   SMALLINT    NOT NULL DEFAULT 1,
  aggregate_type  TEXT        NOT NULL,
  aggregate_id    TEXT        NOT NULL,
  workspace_id    UUID,
  ordering_key    TEXT,
  payload         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT        NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 255),
  trace_id        TEXT,
  status          TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'delivered', 'dead', 'cancelled')),
  attempts        INTEGER     NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_by       TEXT,
  locked_until    TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at    TIMESTAMPTZ,
  CONSTRAINT outbox_events_idem_uq UNIQUE (idempotency_key)
);

-- The relay's hot path: only pending rows are indexed, so it stays tiny.
CREATE INDEX IF NOT EXISTS outbox_events_due_idx
  ON public.outbox_events (next_attempt_at, seq)
  WHERE status = 'pending';
-- The per-key ordering check.
CREATE INDEX IF NOT EXISTS outbox_events_ordering_idx
  ON public.outbox_events (ordering_key, seq)
  WHERE status = 'pending' AND ordering_key IS NOT NULL;
-- Ops lookups ("what happened to licence X").
CREATE INDEX IF NOT EXISTS outbox_events_aggregate_idx
  ON public.outbox_events (aggregate_type, aggregate_id, seq DESC);
-- Retention and "delivered in the last hour".
CREATE INDEX IF NOT EXISTS outbox_events_delivered_idx
  ON public.outbox_events (delivered_at)
  WHERE status = 'delivered';
CREATE INDEX IF NOT EXISTS outbox_events_terminal_idx
  ON public.outbox_events (status, created_at)
  WHERE status IN ('dead', 'cancelled');

-- Queue table: vacuum after ~1% churn instead of 20%.
ALTER TABLE public.outbox_events SET (
  autovacuum_vacuum_scale_factor = 0.01,
  autovacuum_analyze_scale_factor = 0.02,
  fillfactor = 90
);

ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outbox_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.outbox_events TO service_role;

-- Who replayed or cancelled what. Server-only like the table above.
CREATE TABLE IF NOT EXISTS public.outbox_admin_log (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action     TEXT        NOT NULL CHECK (action IN ('replay', 'cancel')),
  actor      TEXT        NOT NULL,
  filter     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  rows       INTEGER     NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.outbox_admin_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outbox_admin_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.outbox_admin_log TO service_role;

-- ---------- emit ----------
CREATE OR REPLACE FUNCTION public.outbox_emit(
  p_event_type      TEXT,
  p_aggregate_type  TEXT,
  p_aggregate_id    TEXT,
  p_workspace_id    UUID,
  p_payload         JSONB,
  p_idempotency_key TEXT,
  p_ordering_key    TEXT DEFAULT NULL,
  p_trace_id        TEXT DEFAULT NULL,
  p_event_version   SMALLINT DEFAULT 1
) RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.outbox_events
    (event_type, event_version, aggregate_type, aggregate_id, workspace_id,
     payload, idempotency_key, ordering_key, trace_id)
  VALUES
    (p_event_type, COALESCE(p_event_version, 1), p_aggregate_type, p_aggregate_id,
     p_workspace_id, COALESCE(p_payload, '{}'::jsonb), p_idempotency_key,
     p_ordering_key, p_trace_id)
  ON CONFLICT (idempotency_key) DO NOTHING;
$$;

-- ---------- claim ----------
CREATE OR REPLACE FUNCTION public.outbox_claim(
  p_relay         TEXT,
  p_batch         INTEGER DEFAULT 50,
  p_lease_seconds INTEGER DEFAULT 60
) RETURNS SETOF public.outbox_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH due AS (
    SELECT e.id
      FROM public.outbox_events e
     WHERE e.status = 'pending'
       AND e.next_attempt_at <= NOW()
       AND (e.locked_until IS NULL OR e.locked_until < NOW())
       AND (e.ordering_key IS NULL OR NOT EXISTS (
             SELECT 1 FROM public.outbox_events o
              WHERE o.ordering_key = e.ordering_key
                AND o.status = 'pending'
                AND o.seq < e.seq))
     ORDER BY e.next_attempt_at, e.seq
     LIMIT LEAST(GREATEST(COALESCE(p_batch, 50), 1), 200)
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.outbox_events e
     SET locked_by    = p_relay,
         locked_until = NOW() + make_interval(secs => LEAST(GREATEST(COALESCE(p_lease_seconds, 60), 5), 900)),
         attempts     = e.attempts + 1
    FROM due
   WHERE e.id = due.id
  RETURNING e.*;
$$;

-- ---------- settle ----------
-- Returns the row's new status, or 'not_holder' when this relay no longer
-- holds the lease (another drain re-claimed it after it expired) or the row
-- is no longer pending. Nothing changes in that case.
CREATE OR REPLACE FUNCTION public.outbox_settle(
  p_id           UUID,
  p_relay        TEXT,
  p_outcome      TEXT,
  p_error        TEXT DEFAULT NULL,
  p_max_attempts INTEGER DEFAULT 10
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_error  TEXT := LEFT(p_error, 500);
BEGIN
  IF p_outcome = 'delivered' THEN
    UPDATE public.outbox_events
       SET status = 'delivered', delivered_at = NOW(),
           locked_until = NULL, last_error = NULL
     WHERE id = p_id AND status = 'pending' AND locked_by = p_relay
    RETURNING status INTO v_status;
  ELSIF p_outcome = 'retry' THEN
    UPDATE public.outbox_events
       SET status = CASE WHEN attempts >= COALESCE(p_max_attempts, 10) THEN 'dead' ELSE 'pending' END,
           next_attempt_at = NOW() + LEAST(
             INTERVAL '6 hours',
             make_interval(secs => (10 * power(3, GREATEST(attempts - 1, 0)))
                                   * (0.8 + random() * 0.4))),
           locked_until = NULL,
           last_error = v_error
     WHERE id = p_id AND status = 'pending' AND locked_by = p_relay
    RETURNING status INTO v_status;
  ELSIF p_outcome = 'dead' THEN
    UPDATE public.outbox_events
       SET status = 'dead', locked_until = NULL, last_error = v_error
     WHERE id = p_id AND status = 'pending' AND locked_by = p_relay
    RETURNING status INTO v_status;
  ELSE
    RAISE EXCEPTION 'unknown outcome %', p_outcome USING ERRCODE = '22023';
  END IF;

  RETURN COALESCE(v_status, 'not_holder');
END;
$$;

-- ---------- health ----------
CREATE OR REPLACE FUNCTION public.outbox_health()
RETURNS TABLE (
  event_type             TEXT,
  pending                BIGINT,
  oldest_pending_seconds INTEGER,
  dead                   BIGINT,
  delivered_last_hour    BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.event_type,
         COUNT(*) FILTER (WHERE e.status = 'pending'),
         COALESCE(EXTRACT(EPOCH FROM NOW() - MIN(e.created_at) FILTER (WHERE e.status = 'pending'))::INTEGER, 0),
         COUNT(*) FILTER (WHERE e.status = 'dead'),
         COUNT(*) FILTER (WHERE e.status = 'delivered' AND e.delivered_at > NOW() - INTERVAL '1 hour')
    FROM public.outbox_events e
   WHERE e.status IN ('pending', 'dead')
      OR (e.status = 'delivered' AND e.delivered_at > NOW() - INTERVAL '1 hour')
   GROUP BY e.event_type
   ORDER BY e.event_type;
$$;

-- ---------- prune ----------
CREATE OR REPLACE FUNCTION public.outbox_prune(p_batch INTEGER DEFAULT 5000)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch   INTEGER := LEAST(GREATEST(COALESCE(p_batch, 5000), 1), 5000);
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.outbox_events
   WHERE id IN (
     SELECT id FROM public.outbox_events
      WHERE (status = 'delivered' AND delivered_at < NOW() - INTERVAL '14 days')
         OR (status = 'cancelled' AND created_at < NOW() - INTERVAL '14 days')
         OR (status = 'dead'      AND created_at < NOW() - INTERVAL '1 year')
      LIMIT v_batch);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- ---------- replay (admin, by hand) ----------
-- By ids, or by event_type + created_at window. Only dead or cancelled rows:
-- a delivered row is not re-sent (Resend's idempotency key lasts 24 h, so a
-- replayed delivered email could go twice).
CREATE OR REPLACE FUNCTION public.outbox_replay(
  p_actor      TEXT,
  p_ids        UUID[]      DEFAULT NULL,
  p_event_type TEXT        DEFAULT NULL,
  p_from       TIMESTAMPTZ DEFAULT NULL,
  p_to         TIMESTAMPTZ DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  IF p_actor IS NULL OR length(trim(p_actor)) = 0 THEN
    RAISE EXCEPTION 'actor is required' USING ERRCODE = '22023';
  END IF;
  IF p_ids IS NULL AND (p_event_type IS NULL OR p_from IS NULL OR p_to IS NULL) THEN
    RAISE EXCEPTION 'give ids, or event_type with a from/to window' USING ERRCODE = '22023';
  END IF;

  UPDATE public.outbox_events
     SET status = 'pending', attempts = 0, next_attempt_at = NOW(),
         locked_by = NULL, locked_until = NULL, last_error = NULL, delivered_at = NULL
   WHERE status IN ('dead', 'cancelled')
     AND (CASE WHEN p_ids IS NOT NULL THEN id = ANY(p_ids)
               ELSE event_type = p_event_type AND created_at >= p_from AND created_at < p_to END);
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  INSERT INTO public.outbox_admin_log (action, actor, filter, rows)
  VALUES ('replay', trim(p_actor),
          jsonb_build_object('ids', p_ids, 'event_type', p_event_type, 'from', p_from, 'to', p_to),
          v_rows);
  RETURN v_rows;
END;
$$;

-- ---------- cancel (admin, by hand) ----------
-- Pending rows that are not currently leased. Kept for audit.
CREATE OR REPLACE FUNCTION public.outbox_cancel(
  p_actor      TEXT,
  p_event_type TEXT,
  p_ids        UUID[] DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  IF p_actor IS NULL OR length(trim(p_actor)) = 0 THEN
    RAISE EXCEPTION 'actor is required' USING ERRCODE = '22023';
  END IF;
  IF p_event_type IS NULL THEN
    RAISE EXCEPTION 'event_type is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.outbox_events
     SET status = 'cancelled'
   WHERE status = 'pending'
     AND event_type = p_event_type
     AND (locked_until IS NULL OR locked_until < NOW())
     AND (p_ids IS NULL OR id = ANY(p_ids));
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  INSERT INTO public.outbox_admin_log (action, actor, filter, rows)
  VALUES ('cancel', trim(p_actor), jsonb_build_object('ids', p_ids, 'event_type', p_event_type), v_rows);
  RETURN v_rows;
END;
$$;

-- ---------- privileges: service role only ----------
REVOKE ALL ON FUNCTION public.outbox_emit(TEXT, TEXT, TEXT, UUID, JSONB, TEXT, TEXT, TEXT, SMALLINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.outbox_claim(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.outbox_settle(UUID, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.outbox_health() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.outbox_prune(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.outbox_replay(TEXT, UUID[], TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.outbox_cancel(TEXT, TEXT, UUID[]) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.outbox_emit(TEXT, TEXT, TEXT, UUID, JSONB, TEXT, TEXT, TEXT, SMALLINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.outbox_claim(TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.outbox_settle(UUID, TEXT, TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.outbox_health() TO service_role;
GRANT EXECUTE ON FUNCTION public.outbox_prune(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.outbox_replay(TEXT, UUID[], TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.outbox_cancel(TEXT, TEXT, UUID[]) TO service_role;

NOTIFY pgrst, 'reload schema';
