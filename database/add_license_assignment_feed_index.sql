-- ---------------------------------------------------------------------------
-- Index supporting the license assignment feed
-- ---------------------------------------------------------------------------
-- `GET /api/licenses/assignments` walks the table in (updated_at, id) order and
-- pages with a keyset cursor on that same tuple. Without a matching index every
-- page costs a full sort of the table, so a sync that walks N pages pays that
-- sort N times — the cost grows with the square of the table, and it grows
-- silently, because each individual page still returns correct data.
--
-- The `id` column is included so the cursor comparison
-- (updated_at > c OR (updated_at = c AND id > cid)) is satisfied by the index
-- alone. Ordering by updated_at only would still need a sort within each group
-- of rows sharing a timestamp, which is exactly the group a cursor lands in.
--
-- Partial on grant_kind = 'base' because that is the only slice the feed reads;
-- add-on rows are excluded from it by design (their created_at is the date of a
-- tier upgrade, not of a seat assignment).
--
-- Safe to run more than once. Run in the Supabase SQL editor for the
-- partner-production project.

CREATE INDEX IF NOT EXISTS idx_licenses_assignment_feed
  ON public.licenses (updated_at, id)
  WHERE grant_kind = 'base';

COMMENT ON INDEX public.idx_licenses_assignment_feed IS
  'Keyset pagination for GET /api/licenses/assignments (Moil seat roster sync).';
