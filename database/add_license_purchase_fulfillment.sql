-- ============================================
-- LICENSE PURCHASE FULFILMENT (Stripe webhook -> partner app)
-- Run this in Supabase SQL Editor, BEFORE deploying the partner app change
-- that calls these functions.
-- ============================================
-- Before this, seats were added by GET /api/licenses/purchase from the query
-- string of the browser redirect after Stripe Checkout (anyone could type the
-- URL with any count), and by a public POST that took any team id. Now the
-- main API's Stripe webhook calls POST /api/licenses/purchase/fulfill (shared
-- internal key) once Stripe says the session is paid, and that route calls
-- fulfill_license_purchase below.
--
--   license_purchases         one row per fulfilled Stripe Checkout session.
--                             The primary key is the session id, so a webhook
--                             redelivered by Stripe adds nothing the second
--                             time.
--   fulfill_license_purchase  inserts that row and, ONLY when the insert
--                             happened, adds the seats with one atomic UPDATE,
--                             all in one transaction.
--   increment_admin_active_license_count
--                             the +1 the /activate route used to do as a
--                             read-then-write (two concurrent activations
--                             could lose one).
-- ============================================

CREATE TABLE IF NOT EXISTS public.license_purchases (
  stripe_session_id TEXT PRIMARY KEY,
  admin_id          UUID NOT NULL,
  team_id           UUID NULL,
  license_count     INTEGER NOT NULL CHECK (license_count > 0 AND license_count <= 10000),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Server-only table: RLS on, no policies, so only the service role reads it.
ALTER TABLE public.license_purchases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.license_purchases FROM PUBLIC, anon, authenticated;

-- Returns TRUE when this call added the seats, FALSE when the session was
-- already fulfilled. Raises (rolling the insert back) when the target does not
-- exist, with SQLSTATE 'P0002' so the route can answer 404 (permanent: the
-- webhook does not retry).
CREATE OR REPLACE FUNCTION public.fulfill_license_purchase(
  p_session_id TEXT,
  p_admin_id   UUID,
  p_team_id    UUID,
  p_count      INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INTEGER;
  v_updated  INTEGER;
BEGIN
  IF p_session_id IS NULL OR length(p_session_id) = 0 OR length(p_session_id) > 255 THEN
    RAISE EXCEPTION 'invalid session id' USING ERRCODE = '22023';
  END IF;
  IF p_admin_id IS NULL THEN
    RAISE EXCEPTION 'admin id is required' USING ERRCODE = '22023';
  END IF;
  IF p_count IS NULL OR p_count < 1 OR p_count > 10000 THEN
    RAISE EXCEPTION 'invalid license count' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.license_purchases (stripe_session_id, admin_id, team_id, license_count)
  VALUES (p_session_id, p_admin_id, p_team_id, p_count)
  ON CONFLICT (stripe_session_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    RETURN FALSE;  -- already fulfilled
  END IF;

  IF p_team_id IS NOT NULL THEN
    UPDATE public.teams
       SET purchased_license_count = COALESCE(purchased_license_count, 0) + p_count
     WHERE id = p_team_id;
  ELSE
    UPDATE public.admins
       SET purchased_license_count = COALESCE(purchased_license_count, 0) + p_count
     WHERE id = p_admin_id;
  END IF;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'purchase target not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.fulfill_license_purchase(TEXT, UUID, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_license_purchase(TEXT, UUID, UUID, INTEGER)
  TO service_role;

CREATE OR REPLACE FUNCTION public.increment_admin_active_license_count(p_admin_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.admins
     SET active_purchased_license_count = COALESCE(active_purchased_license_count, 0) + 1
   WHERE id = p_admin_id;
$$;

REVOKE ALL ON FUNCTION public.increment_admin_active_license_count(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_admin_active_license_count(UUID)
  TO service_role;

NOTIFY pgrst, 'reload schema';
