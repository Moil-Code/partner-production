-- Add-on licenses: a time-boxed tier upgrade on top of an existing license.
--
-- WHAT THIS IS
-- ------------
-- A founder already holding a license (say a partner's standard annual) can be
-- given, say, two months of Market Pro on top. Their base license keeps running
-- underneath the whole time and they fall back to it when the add-on lapses.
--
-- The Moil backend is authoritative for grants — it owns the clock, the
-- entitlement merge and the credit overlay. These rows are the MIRROR, the same
-- role `licenses` already plays for base plans: they exist so an admin looking
-- at a licensee can see what they have.
--
-- THREE CONSEQUENCES, and every one of them is a silent bug if missed:
--
--   1. The duplicate-email check in /api/licenses/add must be scoped to
--      grant_kind = 'base'. It is currently global, so with add-ons in the same
--      table NOBODY WHO HAS A LICENSE COULD EVER BE GIVEN AN ADD-ON — which is
--      the entire feature.
--
--   2. Seat counters must exclude add-ons. An add-on upgrades an existing
--      licensee; counting it would double-count the same person, inflate every
--      partner's usage, and eat a seat they paid for. Decided: add-ons consume
--      no seat.
--
--   3. Listing and stats must label add-ons distinctly, or a partner reading
--      "12 licenses" cannot tell how many people that actually is.
--
-- Apply by hand in the Supabase SQL editor, per this repo's convention.

alter table public.licenses
  add column if not exists grant_kind text not null default 'base'
    check (grant_kind in ('base', 'addon')),
  -- When the add-on window opens. NULL on base rows, which have no such
  -- concept — their clock is activated_at + billing_cycle.
  add column if not exists starts_at timestamptz,
  -- The base license this add-on sits on top of, when we know it. Nullable:
  -- a founder can be granted an add-on before any partner license exists here,
  -- and refusing that would make the mirror stricter than the system it
  -- mirrors. ON DELETE SET NULL — deleting the base row must not delete the
  -- record of an upgrade that really happened.
  add column if not exists parent_license_id uuid
    references public.licenses(id) on delete set null;

comment on column public.licenses.grant_kind is
  'base = the licensee''s own license; addon = a time-boxed tier upgrade on top of one. Add-ons never consume a seat and are excluded from the duplicate-email check.';
comment on column public.licenses.starts_at is
  'Add-ons only: when the upgrade window opens. Base rows use activated_at.';

-- Partial index: add-ons are the rare row, and every query that cares about
-- them filters on exactly this.
create index if not exists idx_licenses_grant_kind
  on public.licenses (grant_kind)
  where grant_kind = 'addon';

-- Finding a licensee's add-ons from their base row.
create index if not exists idx_licenses_parent
  on public.licenses (parent_license_id)
  where parent_license_id is not null;

-- Existing rows are all base licenses. The column default already covers
-- inserts; this is belt-and-braces for any row written between the ALTER and
-- the default taking effect.
update public.licenses
set grant_kind = 'base'
where grant_kind is null;

notify pgrst, 'reload schema';
