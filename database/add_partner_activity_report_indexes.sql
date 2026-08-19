-- ---------------------------------------------------------------------------
-- Indexes for the partner license activity report
-- ---------------------------------------------------------------------------
-- Run this in the Supabase SQL Editor, like every other file in this folder.
--
-- The admin portal's report pulls ONE partner's base licenses through
-- /api/licenses/assignments?partnerId=..., paging on (updated_at, id).
--
-- add_license_assignment_feed_index.sql already covers the UNSCOPED walk. It
-- does not cover this one: with a partner_id equality in front of the sort,
-- Postgres either scans the fleet-wide index and filters (reading every
-- partner's rows to return one partner's) or sorts the partner's rows from
-- scratch on every page. Both return correct data, which is exactly why this
-- is worth writing down — an N-page pull pays the cost N times and nothing
-- anywhere reports that it happened.
CREATE INDEX IF NOT EXISTS idx_licenses_partner_assignment_feed
  ON public.licenses (partner_id, updated_at, id)
  WHERE grant_kind = 'base';

-- The directory's issued/activated counts read (partner_id, is_activated) for
-- a set of partners. Index-only for that projection, so the count does not
-- touch the heap at all.
CREATE INDEX IF NOT EXISTS idx_licenses_partner_activation_counts
  ON public.licenses (partner_id, is_activated)
  WHERE grant_kind = 'base';

-- The picker searches partners by name/domain. Small table today, so this is
-- about keeping it small-feeling rather than rescuing it — but a trigram index
-- is what makes `ilike '%term%'` an index scan rather than a sequential one,
-- and adding it now costs nothing.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_partners_name_trgm
  ON public.partners USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_partners_domain_trgm
  ON public.partners USING gin (domain gin_trgm_ops);
