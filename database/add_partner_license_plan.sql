-- Add license plan configuration to partners.
-- When set, every license issued by that partner will automatically call
-- the Moil backend to grant or upgrade the recipient's subscription to
-- the configured plan — no manual intervention required.
--
-- license_plan:         one of 'standard', 'professional', 'market_pro'
-- license_billing_cycle: 'yearly' | 'monthly'  (default yearly for annual packages)

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS license_plan TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS license_billing_cycle TEXT DEFAULT NULL;

COMMENT ON COLUMN public.partners.license_plan IS 'Moil plan tier granted to license recipients (standard | professional | market_pro)';
COMMENT ON COLUMN public.partners.license_billing_cycle IS 'Billing cycle for the granted plan (yearly | monthly)';
