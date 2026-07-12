-- ============================================
-- ADD LICENSE PLAN METADATA + MOIL USER LINK
-- Run this in Supabase SQL Editor
-- ============================================
-- Adds plan metadata columns to public.licenses so the partner
-- dashboard can track WHICH plan a license grants, when it expires,
-- and the Moil (MongoDB) user id — the stable cross-platform join key.
--
-- Values are reported by the Moil backend's activate_license response
-- and/or the public /api/licenses/activate callback; all are nullable
-- because older rows (and Moil responses that predate these fields)
-- won't have them.
--
-- Also adds admins.active_purchased_license_count, which the activate
-- endpoint has referenced for a while but was never in the schema
-- (schema drift fix).
-- ============================================

ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS plan_tier     TEXT,
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT,
  ADD COLUMN IF NOT EXISTS months        INTEGER,
  ADD COLUMN IF NOT EXISTS expires_at    TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS moil_user_id  TEXT;

COMMENT ON COLUMN public.licenses.plan_tier IS
  'Plan tier granted by this license: standard | professional | market_pro.';
COMMENT ON COLUMN public.licenses.billing_cycle IS
  'Billing cycle of the granted plan: yearly | monthly.';
COMMENT ON COLUMN public.licenses.months IS
  'Duration in months (1-12) when billing_cycle is monthly. NULL for yearly.';
COMMENT ON COLUMN public.licenses.expires_at IS
  'License plan expiry as reported by the Moil backend. NULL when unknown.';
COMMENT ON COLUMN public.licenses.moil_user_id IS
  'Moil (MongoDB) user id of the license holder — the stable cross-platform join key.';

-- Permissive CHECK constraints (allow NULL; guard against typos).
-- Wrapped in DO blocks so re-running the script is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'licenses_plan_tier_check'
  ) THEN
    ALTER TABLE public.licenses
      ADD CONSTRAINT licenses_plan_tier_check
      CHECK (plan_tier IS NULL OR plan_tier IN ('standard', 'professional', 'market_pro'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'licenses_billing_cycle_check'
  ) THEN
    ALTER TABLE public.licenses
      ADD CONSTRAINT licenses_billing_cycle_check
      CHECK (billing_cycle IS NULL OR billing_cycle IN ('yearly', 'monthly'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'licenses_months_check'
  ) THEN
    ALTER TABLE public.licenses
      ADD CONSTRAINT licenses_months_check
      CHECK (months IS NULL OR (months >= 1 AND months <= 12));
  END IF;
END $$;

-- Indexes: expiry sweeps + cross-platform user lookup.
CREATE INDEX IF NOT EXISTS idx_licenses_expires_at
  ON public.licenses(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_licenses_moil_user_id
  ON public.licenses(moil_user_id) WHERE moil_user_id IS NOT NULL;

-- ============================================
-- ADMINS: fix schema drift
-- ============================================
-- /api/licenses/activate increments this counter but the column was
-- never added to the schema.

ALTER TABLE public.admins
  ADD COLUMN IF NOT EXISTS active_purchased_license_count INTEGER DEFAULT 0;

COMMENT ON COLUMN public.admins.active_purchased_license_count IS
  'Count of this admin''s licenses that have been activated by end users.';
