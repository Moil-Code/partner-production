-- ============================================
-- MOIL PARTNERS COMPLETE DATABASE SCHEMA
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- STEP 1: CREATE CUSTOM TYPES
-- ============================================

-- Partner status enum
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'partner_status') THEN
    CREATE TYPE partner_status AS ENUM ('pending', 'active', 'suspended', 'rejected');
  END IF;
END $$;

-- Admin global role enum
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_role') THEN
    CREATE TYPE admin_role AS ENUM ('moil_admin', 'partner_admin', 'member');
  END IF;
END $$;

-- Team member role enum
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'team_role') THEN
    CREATE TYPE team_role AS ENUM ('owner', 'admin', 'member');
  END IF;
END $$;

-- Invitation status enum
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invitation_status') THEN
    CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired', 'cancelled');
  END IF;
END $$;

-- ============================================
-- STEP 2: CREATE PARTNERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  domain TEXT UNIQUE NOT NULL,
  status partner_status DEFAULT 'pending' NOT NULL,
  
  -- Branding fields
  program_name TEXT,
  full_name TEXT,
  primary_color TEXT DEFAULT '#6366F1',
  secondary_color TEXT DEFAULT '#8B5CF6',
  accent_color TEXT DEFAULT '#F59E0B',
  text_color TEXT DEFAULT '#1F2A44',
  logo_url TEXT,
  logo_initial TEXT,
  font_family TEXT DEFAULT 'Inter',
  support_email TEXT,
  
  -- License settings
  license_duration INTEGER DEFAULT 365,
  features JSONB DEFAULT '[]'::jsonb,
  
  -- Approval token for email-based approval
  approval_token TEXT UNIQUE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE public.partners IS 'Partner organizations that use Moil';

-- ============================================
-- STEP 3: CREATE ADMINS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.admins (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  global_role admin_role DEFAULT 'member' NOT NULL,
  purchased_license_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE public.admins IS 'Admin users who manage licenses and teams';

-- ============================================
-- STEP 4: CREATE TEAMS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID REFERENCES public.admins(id) ON DELETE SET NULL,
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  domain TEXT,
  purchased_license_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE public.teams IS 'Teams within partner organizations';

-- ============================================
-- STEP 5: CREATE TEAM MEMBERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES public.admins(id) ON DELETE CASCADE,
  role team_role DEFAULT 'member' NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  
  UNIQUE(team_id, admin_id)
);

COMMENT ON TABLE public.team_members IS 'Membership linking admins to teams';

-- ============================================
-- STEP 6: CREATE TEAM INVITATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role team_role DEFAULT 'member' NOT NULL,
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status invitation_status DEFAULT 'pending' NOT NULL,
  invited_by UUID REFERENCES public.admins(id) ON DELETE SET NULL,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days') NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  
  UNIQUE(team_id, email)
);

COMMENT ON TABLE public.team_invitations IS 'Pending invitations to join teams';

-- ============================================
-- STEP 7: CREATE LICENSES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  admin_id UUID REFERENCES public.admins(id) ON DELETE SET NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  
  -- Business info
  business_name TEXT DEFAULT '',
  business_type TEXT DEFAULT '',
  
  -- Activation status
  is_activated BOOLEAN DEFAULT FALSE NOT NULL,
  activated_at TIMESTAMP WITH TIME ZONE,
  
  -- Email tracking
  message_id TEXT,
  email_status TEXT DEFAULT 'pending',
  
  -- Audit
  performed_by UUID REFERENCES public.admins(id) ON DELETE SET NULL,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE public.licenses IS 'Licenses assigned to end users';

-- ============================================
-- STEP 8: CREATE ACTIVITY LOGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES public.admins(id) ON DELETE SET NULL,
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE public.activity_logs IS 'Audit log of all activities';

-- ============================================
-- STEP 9: CREATE UPDATE TIMESTAMP FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 10: CREATE UPDATE TRIGGERS
-- ============================================

DROP TRIGGER IF EXISTS update_partners_updated_at ON public.partners;
CREATE TRIGGER update_partners_updated_at
  BEFORE UPDATE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_admins_updated_at ON public.admins;
CREATE TRIGGER update_admins_updated_at
  BEFORE UPDATE ON public.admins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_teams_updated_at ON public.teams;
CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_licenses_updated_at ON public.licenses;
CREATE TRIGGER update_licenses_updated_at
  BEFORE UPDATE ON public.licenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- STEP 11: CREATE INDEXES
-- ============================================

-- Partners indexes
CREATE INDEX IF NOT EXISTS idx_partners_domain ON public.partners(lower(domain));
CREATE INDEX IF NOT EXISTS idx_partners_status ON public.partners(status) WHERE status = 'active';

-- Admins indexes
CREATE INDEX IF NOT EXISTS idx_admins_email ON public.admins(lower(email));
CREATE INDEX IF NOT EXISTS idx_admins_partner_id ON public.admins(partner_id);
CREATE INDEX IF NOT EXISTS idx_admins_global_role ON public.admins(global_role);

-- Teams indexes
CREATE INDEX IF NOT EXISTS idx_teams_owner_id ON public.teams(owner_id);
CREATE INDEX IF NOT EXISTS idx_teams_partner_id ON public.teams(partner_id);
CREATE INDEX IF NOT EXISTS idx_teams_domain ON public.teams(domain);

-- Team Members indexes
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_admin_id ON public.team_members(admin_id);

-- Team Invitations indexes
CREATE INDEX IF NOT EXISTS idx_team_invitations_team_id ON public.team_invitations(team_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email ON public.team_invitations(lower(email));
CREATE INDEX IF NOT EXISTS idx_team_invitations_token ON public.team_invitations(token);
CREATE INDEX IF NOT EXISTS idx_team_invitations_status ON public.team_invitations(status);

-- Licenses indexes
CREATE INDEX IF NOT EXISTS idx_licenses_admin_id ON public.licenses(admin_id);
CREATE INDEX IF NOT EXISTS idx_licenses_team_id ON public.licenses(team_id);
CREATE INDEX IF NOT EXISTS idx_licenses_partner_id ON public.licenses(partner_id);
CREATE INDEX IF NOT EXISTS idx_licenses_email ON public.licenses(lower(email));
CREATE INDEX IF NOT EXISTS idx_licenses_is_activated ON public.licenses(is_activated);
CREATE INDEX IF NOT EXISTS idx_licenses_message_id ON public.licenses(message_id) WHERE message_id IS NOT NULL;

-- Activity Logs indexes
CREATE INDEX IF NOT EXISTS idx_activity_logs_team_id ON public.activity_logs(team_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_admin_id ON public.activity_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_partner_id ON public.activity_logs(partner_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_activity_type ON public.activity_logs(activity_type);

-- ============================================
-- STEP 12: CREATE RLS HELPER FUNCTIONS
-- These functions bypass RLS to avoid circular dependencies
-- ============================================

-- Function to get user's global_role (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_user_global_role(user_id UUID)
RETURNS TEXT AS $$
DECLARE
  result_role TEXT;
BEGIN
  SELECT global_role::TEXT INTO result_role
  FROM public.admins 
  WHERE id = user_id;
  RETURN result_role;
END;
$$ LANGUAGE plpgsql 
SECURITY DEFINER 
STABLE
SET search_path = public, pg_temp;

-- Function to get user's partner_id (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_user_partner_id(user_id UUID)
RETURNS UUID AS $$
DECLARE
  result_partner_id UUID;
BEGIN
  SELECT partner_id INTO result_partner_id
  FROM public.admins 
  WHERE id = user_id;
  RETURN result_partner_id;
END;
$$ LANGUAGE plpgsql 
SECURITY DEFINER 
STABLE
SET search_path = public, pg_temp;

-- Function to get user's team IDs (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_user_team_ids(user_id UUID)
RETURNS SETOF UUID AS $$
BEGIN
  RETURN QUERY
  SELECT team_id FROM public.team_members WHERE admin_id = user_id;
END;
$$ LANGUAGE plpgsql 
SECURITY DEFINER 
STABLE
SET search_path = public, pg_temp;

-- Function to get team IDs where user is admin/owner (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_user_admin_team_ids(user_id UUID)
RETURNS SETOF UUID AS $$
BEGIN
  RETURN QUERY
  SELECT team_id FROM public.team_members 
  WHERE admin_id = user_id AND role IN ('owner', 'admin');
END;
$$ LANGUAGE plpgsql 
SECURITY DEFINER 
STABLE
SET search_path = public, pg_temp;

-- Function to check if user is Moil admin
CREATE OR REPLACE FUNCTION public.is_moil_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admins 
    WHERE id = user_id 
    AND global_role = 'moil_admin'
  );
END;
$$ LANGUAGE plpgsql 
SECURITY DEFINER 
STABLE
SET search_path = public, pg_temp;

-- Function to check if user is team admin/owner
CREATE OR REPLACE FUNCTION public.is_team_admin(user_id UUID, check_team_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE admin_id = user_id 
    AND team_id = check_team_id 
    AND role IN ('owner', 'admin')
  );
END;
$$ LANGUAGE plpgsql 
SECURITY DEFINER 
STABLE
SET search_path = public, pg_temp;

-- Function to get partner by email domain
CREATE OR REPLACE FUNCTION public.get_partner_by_email(user_email TEXT)
RETURNS UUID AS $$
DECLARE
  email_domain TEXT;
  found_partner_id UUID;
BEGIN
  IF user_email IS NULL OR user_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RETURN NULL;
  END IF;
  
  email_domain := lower(split_part(user_email, '@', 2));
  
  SELECT p.id INTO found_partner_id
  FROM public.partners p
  WHERE lower(p.domain) = email_domain
  AND p.status = 'active'
  LIMIT 1;
  
  RETURN found_partner_id;
END;
$$ LANGUAGE plpgsql 
SECURITY DEFINER 
STABLE
SET search_path = public, pg_temp;

-- Function to log activity
CREATE OR REPLACE FUNCTION public.log_activity(
  p_team_id UUID DEFAULT NULL,
  p_admin_id UUID DEFAULT NULL,
  p_activity_type TEXT DEFAULT 'unknown',
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO public.activity_logs (team_id, admin_id, activity_type, description, metadata)
  VALUES (p_team_id, p_admin_id, p_activity_type, p_description, p_metadata)
  RETURNING id INTO new_id;
  
  RETURN new_id;
END;
$$ LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, pg_temp;

-- ============================================
-- STEP 13: SET FUNCTION OWNERSHIP
-- Functions must be owned by postgres to bypass RLS
-- ============================================

ALTER FUNCTION public.get_user_global_role(UUID) OWNER TO postgres;
ALTER FUNCTION public.get_user_partner_id(UUID) OWNER TO postgres;
ALTER FUNCTION public.get_user_team_ids(UUID) OWNER TO postgres;
ALTER FUNCTION public.get_user_admin_team_ids(UUID) OWNER TO postgres;
ALTER FUNCTION public.is_moil_admin(UUID) OWNER TO postgres;
ALTER FUNCTION public.is_team_admin(UUID, UUID) OWNER TO postgres;
ALTER FUNCTION public.get_partner_by_email(TEXT) OWNER TO postgres;
ALTER FUNCTION public.log_activity(UUID, UUID, TEXT, TEXT, JSONB) OWNER TO postgres;

-- ============================================
-- STEP 14: GRANT FUNCTION PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.get_user_global_role(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_partner_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_team_ids(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_admin_team_ids(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_moil_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_admin(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_partner_by_email(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_activity(UUID, UUID, TEXT, TEXT, JSONB) TO authenticated;

-- ============================================
-- STEP 15: CREATE HANDLE NEW ADMIN TRIGGER FUNCTION
-- This runs when a new user signs up via Supabase Auth
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_admin()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  found_partner_id UUID;
  email_domain TEXT;
  user_global_role admin_role;
BEGIN
  -- Skip if email is invalid
  IF NEW.email IS NULL OR NEW.email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RETURN NEW;
  END IF;

  -- Extract domain from email
  email_domain := lower(split_part(NEW.email, '@', 2));
  
  -- Check if this is a Moil admin (@moilapp.com)
  IF email_domain = 'moilapp.com' THEN
    user_global_role := 'moil_admin';
    found_partner_id := NULL;
  ELSE
    -- Try to find a matching active partner
    SELECT p.id INTO found_partner_id
    FROM public.partners p
    WHERE lower(p.domain) = email_domain
    AND p.status = 'active'
    LIMIT 1;
    
    IF found_partner_id IS NOT NULL THEN
      user_global_role := 'partner_admin';
    ELSE
      user_global_role := 'member';
    END IF;
  END IF;

  -- Insert or update admin record
  INSERT INTO public.admins (id, email, global_role, partner_id)
  VALUES (NEW.id, NEW.email, user_global_role, found_partner_id)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    global_role = CASE 
      WHEN public.admins.global_role = 'moil_admin' THEN 'moil_admin'
      ELSE EXCLUDED.global_role 
    END,
    partner_id = COALESCE(public.admins.partner_id, EXCLUDED.partner_id),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure the function is owned by postgres (superuser) to bypass RLS
ALTER FUNCTION public.handle_new_admin() OWNER TO postgres;

-- Create trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_admin();

-- ============================================
-- STEP 16: ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 17: DROP EXISTING POLICIES
-- ============================================

DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT schemaname, tablename, policyname 
            FROM pg_policies 
            WHERE schemaname = 'public') 
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON ' || r.schemaname || '.' || r.tablename;
  END LOOP;
END $$;

-- ============================================
-- STEP 18: CREATE RLS POLICIES
-- ============================================

-- ==================
-- PARTNERS POLICIES
-- ==================

CREATE POLICY "partners_select" ON public.partners
  FOR SELECT TO authenticated
  USING (
    status = 'active'
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
    OR
    id = public.get_user_partner_id(auth.uid())
  );

-- Allow any authenticated user to create a partner (for signup flow)
-- Moil admins use secret key, regular admins can create via RLS
CREATE POLICY "partners_insert" ON public.partners
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "partners_update" ON public.partners
  FOR UPDATE TO authenticated
  USING (
    public.get_user_global_role(auth.uid()) = 'moil_admin'
    OR
    (id = public.get_user_partner_id(auth.uid()) AND public.get_user_global_role(auth.uid()) = 'partner_admin')
  );

CREATE POLICY "partners_delete" ON public.partners
  FOR DELETE TO authenticated
  USING (public.get_user_global_role(auth.uid()) = 'moil_admin');

CREATE POLICY "partners_service" ON public.partners
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================
-- ADMINS POLICIES
-- ==================

-- Allow the auth trigger to insert new admin records
CREATE POLICY "admins_insert_trigger" ON public.admins
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "admins_select" ON public.admins
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
    OR
    (partner_id IS NOT NULL AND partner_id = public.get_user_partner_id(auth.uid()))
  );

CREATE POLICY "admins_update" ON public.admins
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.get_user_global_role(auth.uid()) = 'moil_admin');

CREATE POLICY "admins_service" ON public.admins
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================
-- TEAMS POLICIES
-- ==================

CREATE POLICY "teams_select" ON public.teams
  FOR SELECT TO authenticated
  USING (
    public.get_user_global_role(auth.uid()) = 'moil_admin'
    OR
    id IN (SELECT public.get_user_team_ids(auth.uid()))
    OR
    (partner_id IS NOT NULL AND partner_id = public.get_user_partner_id(auth.uid()))
  );

CREATE POLICY "teams_insert" ON public.teams
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "teams_update" ON public.teams
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

CREATE POLICY "teams_delete" ON public.teams
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.get_user_global_role(auth.uid()) = 'moil_admin');

CREATE POLICY "teams_service" ON public.teams
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================
-- TEAM MEMBERS POLICIES
-- ==================

CREATE POLICY "team_members_select" ON public.team_members
  FOR SELECT TO authenticated
  USING (
    admin_id = auth.uid()
    OR
    team_id IN (SELECT public.get_user_team_ids(auth.uid()))
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

CREATE POLICY "team_members_insert" ON public.team_members
  FOR INSERT TO authenticated
  WITH CHECK (
    admin_id = auth.uid()
    OR
    team_id IN (SELECT public.get_user_admin_team_ids(auth.uid()))
  );

CREATE POLICY "team_members_update" ON public.team_members
  FOR UPDATE TO authenticated
  USING (
    team_id IN (SELECT public.get_user_admin_team_ids(auth.uid()))
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

CREATE POLICY "team_members_delete" ON public.team_members
  FOR DELETE TO authenticated
  USING (
    admin_id = auth.uid()
    OR
    team_id IN (SELECT public.get_user_admin_team_ids(auth.uid()))
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

CREATE POLICY "team_members_service" ON public.team_members
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================
-- TEAM INVITATIONS POLICIES
-- ==================

CREATE POLICY "invitations_select" ON public.team_invitations
  FOR SELECT TO authenticated
  USING (
    lower(email) = lower((SELECT email FROM public.admins WHERE id = auth.uid()))
    OR
    team_id IN (SELECT public.get_user_team_ids(auth.uid()))
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

CREATE POLICY "invitations_insert" ON public.team_invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    team_id IN (SELECT public.get_user_admin_team_ids(auth.uid()))
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

CREATE POLICY "invitations_update" ON public.team_invitations
  FOR UPDATE TO authenticated
  USING (
    lower(email) = lower((SELECT email FROM public.admins WHERE id = auth.uid()))
    OR
    team_id IN (SELECT public.get_user_admin_team_ids(auth.uid()))
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

CREATE POLICY "invitations_delete" ON public.team_invitations
  FOR DELETE TO authenticated
  USING (
    team_id IN (SELECT public.get_user_admin_team_ids(auth.uid()))
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

CREATE POLICY "invitations_service" ON public.team_invitations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================
-- LICENSES POLICIES
-- ==================

CREATE POLICY "licenses_select" ON public.licenses
  FOR SELECT TO authenticated
  USING (
    admin_id = auth.uid()
    OR
    team_id IN (SELECT public.get_user_team_ids(auth.uid()))
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

CREATE POLICY "licenses_insert" ON public.licenses
  FOR INSERT TO authenticated
  WITH CHECK (
    admin_id = auth.uid()
    OR
    team_id IN (SELECT public.get_user_team_ids(auth.uid()))
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

CREATE POLICY "licenses_update" ON public.licenses
  FOR UPDATE TO authenticated
  USING (
    admin_id = auth.uid()
    OR
    team_id IN (SELECT public.get_user_team_ids(auth.uid()))
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

CREATE POLICY "licenses_delete" ON public.licenses
  FOR DELETE TO authenticated
  USING (
    admin_id = auth.uid()
    OR
    team_id IN (SELECT public.get_user_admin_team_ids(auth.uid()))
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

CREATE POLICY "licenses_service" ON public.licenses
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================
-- ACTIVITY LOGS POLICIES
-- ==================

CREATE POLICY "activity_select" ON public.activity_logs
  FOR SELECT TO authenticated
  USING (
    admin_id = auth.uid()
    OR
    team_id IN (SELECT public.get_user_team_ids(auth.uid()))
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

CREATE POLICY "activity_insert" ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    admin_id = auth.uid()
    OR
    team_id IN (SELECT public.get_user_team_ids(auth.uid()))
    OR
    public.get_user_global_role(auth.uid()) = 'moil_admin'
  );

CREATE POLICY "activity_service" ON public.activity_logs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================
-- STEP 19: GRANT TABLE PERMISSIONS
-- ============================================

GRANT ALL ON public.partners TO authenticated;
GRANT ALL ON public.admins TO authenticated;
GRANT ALL ON public.teams TO authenticated;
GRANT ALL ON public.team_members TO authenticated;
GRANT ALL ON public.team_invitations TO authenticated;
GRANT ALL ON public.licenses TO authenticated;
GRANT ALL ON public.activity_logs TO authenticated;

GRANT ALL ON public.partners TO service_role;
GRANT ALL ON public.admins TO service_role;
GRANT ALL ON public.teams TO service_role;
GRANT ALL ON public.team_members TO service_role;
GRANT ALL ON public.team_invitations TO service_role;
GRANT ALL ON public.licenses TO service_role;
GRANT ALL ON public.activity_logs TO service_role;

-- ============================================
-- COMPLETE!
-- ============================================

SELECT 'Moil Partners schema created successfully!' as status;
