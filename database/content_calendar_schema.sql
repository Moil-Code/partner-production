-- ============================================
-- CONTENT CALENDAR FEATURE
-- ============================================
-- Adds the `content_items` table backing the partner content calendar.
-- Each row is a piece of scheduled marketing content with a `content_type`
-- (video / still image / carousel / animated flyer). Items are imported via
-- CSV and displayed on a monthly calendar; clicking a calendar box opens a
-- sidebar that can edit the content type and other fields.
--
-- Apply manually in the Supabase SQL Editor (same workflow as the rest of the
-- files in database/). Safe to re-run.

-- ============================================
-- STEP 1: CREATE CONTENT ITEMS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership / tenancy (mirrors licenses)
  admin_id UUID REFERENCES public.admins(id) ON DELETE SET NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,

  -- Content details
  title TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT 'still_image'
    CHECK (content_type IN ('video', 'still_image', 'carousel', 'animated_flyer')),
  scheduled_date DATE NOT NULL,
  caption TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled',
  media_url TEXT,

  -- Audit
  performed_by UUID REFERENCES public.admins(id) ON DELETE SET NULL,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE public.content_items IS 'Scheduled content shown on the partner content calendar';
COMMENT ON COLUMN public.content_items.content_type IS 'Media format: video, still_image, carousel, animated_flyer';

CREATE INDEX IF NOT EXISTS content_items_team_date_idx
  ON public.content_items (team_id, scheduled_date);
CREATE INDEX IF NOT EXISTS content_items_admin_date_idx
  ON public.content_items (admin_id, scheduled_date);

-- ============================================
-- STEP 2: UPDATED_AT TRIGGER
-- ============================================

DROP TRIGGER IF EXISTS update_content_items_updated_at ON public.content_items;
CREATE TRIGGER update_content_items_updated_at
  BEFORE UPDATE ON public.content_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- STEP 3: ROW LEVEL SECURITY
-- ============================================
-- Mirrors the licenses table policies: a user can see/manage content owned by
-- them directly or by any team they belong to; moil_admins see everything; the
-- service role bypasses RLS entirely.

ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content_items_select" ON public.content_items;
CREATE POLICY "content_items_select" ON public.content_items
  FOR SELECT TO authenticated
  USING (
    admin_id = auth.uid()
    OR
    team_id IN (SELECT public.get_user_team_ids(auth.uid()))
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

DROP POLICY IF EXISTS "content_items_insert" ON public.content_items;
CREATE POLICY "content_items_insert" ON public.content_items
  FOR INSERT TO authenticated
  WITH CHECK (
    admin_id = auth.uid()
    OR
    team_id IN (SELECT public.get_user_team_ids(auth.uid()))
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

DROP POLICY IF EXISTS "content_items_update" ON public.content_items;
CREATE POLICY "content_items_update" ON public.content_items
  FOR UPDATE TO authenticated
  USING (
    admin_id = auth.uid()
    OR
    team_id IN (SELECT public.get_user_team_ids(auth.uid()))
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

DROP POLICY IF EXISTS "content_items_delete" ON public.content_items;
CREATE POLICY "content_items_delete" ON public.content_items
  FOR DELETE TO authenticated
  USING (
    admin_id = auth.uid()
    OR
    team_id IN (SELECT public.get_user_team_ids(auth.uid()))
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

DROP POLICY IF EXISTS "content_items_service" ON public.content_items;
CREATE POLICY "content_items_service" ON public.content_items
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
