-- ============================================
-- Allow team-level license management
-- ============================================
-- Run this in the Supabase SQL Editor.
--
-- Background: the licenses table was effectively read-only for most of a team.
-- `licenses_delete` only accepted team owners/admins (get_user_admin_team_ids),
-- while `licenses_select` and `licenses_update` accepted any member — so the
-- dashboard's Delete button silently removed nothing for regular members, and
-- Moil staff without `global_role = 'moil_admin'` were blocked outright even
-- though the app treats every @moilapp.com account as Moil staff.
--
-- This script:
--   1. Adds is_moil_staff(), matching the app's rule (global_role OR
--      @moilapp.com email) so RLS and the API routes agree on who is staff.
--   2. Lets any member of a team update/delete that team's licenses, so the
--      resend / edit-email / delete actions work for the whole team.
--
-- Idempotent: safe to re-run.

-- --------------------------------------------
-- STEP 1: Moil staff helper
-- --------------------------------------------
-- SECURITY DEFINER so it can read `admins` without re-entering that table's
-- own RLS policies (which would recurse).
CREATE OR REPLACE FUNCTION public.is_moil_staff(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admins
    WHERE id = user_id
      AND (
        global_role = 'moil_admin'
        OR lower(email) LIKE '%@moilapp.com'
      )
  );
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp;

ALTER FUNCTION public.is_moil_staff(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_moil_staff(UUID) TO authenticated;

-- --------------------------------------------
-- STEP 2: License policies
-- --------------------------------------------

DROP POLICY IF EXISTS "licenses_select" ON public.licenses;
CREATE POLICY "licenses_select" ON public.licenses
  FOR SELECT TO authenticated
  USING (
    admin_id = auth.uid()
    OR
    team_id IN (SELECT public.get_user_team_ids(auth.uid()))
    OR
    public.is_moil_staff(auth.uid())
  );

DROP POLICY IF EXISTS "licenses_insert" ON public.licenses;
CREATE POLICY "licenses_insert" ON public.licenses
  FOR INSERT TO authenticated
  WITH CHECK (
    admin_id = auth.uid()
    OR
    team_id IN (SELECT public.get_user_team_ids(auth.uid()))
    OR
    public.is_moil_staff(auth.uid())
  );

-- WITH CHECK mirrors USING so a row cannot be updated out of the caller's scope
-- (e.g. reassigned to another team) — the original policy omitted it.
DROP POLICY IF EXISTS "licenses_update" ON public.licenses;
CREATE POLICY "licenses_update" ON public.licenses
  FOR UPDATE TO authenticated
  USING (
    admin_id = auth.uid()
    OR
    team_id IN (SELECT public.get_user_team_ids(auth.uid()))
    OR
    public.is_moil_staff(auth.uid())
  )
  WITH CHECK (
    admin_id = auth.uid()
    OR
    team_id IN (SELECT public.get_user_team_ids(auth.uid()))
    OR
    public.is_moil_staff(auth.uid())
  );

-- Was get_user_admin_team_ids (owner/admin only); now any team member, to match
-- select/update. The "only pending licenses may be deleted" rule is enforced in
-- /api/licenses/delete rather than here.
DROP POLICY IF EXISTS "licenses_delete" ON public.licenses;
CREATE POLICY "licenses_delete" ON public.licenses
  FOR DELETE TO authenticated
  USING (
    admin_id = auth.uid()
    OR
    team_id IN (SELECT public.get_user_team_ids(auth.uid()))
    OR
    public.is_moil_staff(auth.uid())
  );

-- Service role (createAdminClient) keeps full access.
DROP POLICY IF EXISTS "licenses_service" ON public.licenses;
CREATE POLICY "licenses_service" ON public.licenses
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- --------------------------------------------
-- Verify
-- --------------------------------------------
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'licenses'
-- ORDER BY policyname;
