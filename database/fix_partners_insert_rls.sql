-- ============================================
-- FIX PARTNERS INSERT RLS POLICY
-- Run this in Supabase SQL Editor to allow regular admins to create partners
-- ============================================

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "partners_insert" ON public.partners;

-- Create new policy that allows any authenticated user to create partners
-- This enables the signup flow where admins can create their own partner
CREATE POLICY "partners_insert" ON public.partners
  FOR INSERT TO authenticated
  WITH CHECK (true);

SELECT 'Partners insert RLS policy updated successfully!' as status;
