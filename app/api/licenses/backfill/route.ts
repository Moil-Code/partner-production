import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  parsePlanKey,
  LICENSE_PLANS,
  BILLING_CYCLES,
  MAX_MONTHS,
  type LicensePlan,
  type BillingCycle,
} from '@/lib/licensePlanDefaults';

/**
 * Public endpoint (same trust model as /activate and /verify) called by the
 * Moil backend's admin "Backfill partner licenses" action.
 *
 * Fills the plan-metadata columns added by database/add_license_metadata.sql
 * (plan_tier, billing_cycle, months, expires_at, moil_user_id) onto EXISTING
 * license rows that were created before those columns existed.
 *
 * Trust model — mirrors /activate:
 *   - No API key. Like /activate, a caller must already know the exact license
 *     UUID(s) to affect anything; rows are matched ONLY by `licenseId`. There
 *     is no email/spray matching.
 *   - It ONLY writes the five metadata columns; it never touches is_activated,
 *     activated_at, email, business_name, admin/team/partner ids, or counters —
 *     so it is strictly less powerful than the already-public /activate.
 *   - FILL-IF-NULL by default (a column already holding a value is left alone),
 *     so re-running is a safe no-op. Pass force:true to overwrite.
 *   - dryRun:true reports what WOULD change without writing anything.
 *
 * Body: {
 *   items: Array<{
 *     licenseId: string,     // REQUIRED — the partner license row UUID
 *     moilUserId?: string,
 *     plan?: string,         // resolved key e.g. 'standard_yearly'
 *     planTier?: string,     // explicit; wins over `plan`
 *     billingCycle?: string, // explicit; wins over `plan`
 *     months?: number,
 *     expiresAt?: string,    // ISO date
 *   }>,
 *   dryRun?: boolean,
 *   force?: boolean,
 * }
 */

const MAX_ITEMS = 1000;

type BackfillItem = {
  licenseId?: unknown;
  moilUserId?: unknown;
  plan?: unknown;
  planTier?: unknown;
  billingCycle?: unknown;
  months?: unknown;
  expiresAt?: unknown;
};

type LicenseRow = {
  id: string;
  plan_tier: string | null;
  billing_cycle: string | null;
  months: number | null;
  expires_at: string | null;
  moil_user_id: string | null;
};

// Resolve the metadata an item wants to set, validating every field.
function resolveDesired(item: BackfillItem) {
  const resolved = parsePlanKey(item.plan);
  const planTier =
    typeof item.planTier === 'string' &&
    LICENSE_PLANS.includes(item.planTier as LicensePlan)
      ? (item.planTier as LicensePlan)
      : resolved?.planTier;
  const billingCycle =
    typeof item.billingCycle === 'string' &&
    BILLING_CYCLES.includes(item.billingCycle as BillingCycle)
      ? (item.billingCycle as BillingCycle)
      : resolved?.billingCycle;

  let months: number | undefined;
  const rawMonths =
    typeof item.months === 'number'
      ? item.months
      : typeof item.months === 'string'
        ? Number.parseInt(item.months, 10)
        : NaN;
  if (Number.isInteger(rawMonths) && rawMonths >= 1 && rawMonths <= MAX_MONTHS) {
    months = rawMonths;
  }

  const moilUserId =
    typeof item.moilUserId === 'string' && item.moilUserId
      ? item.moilUserId
      : undefined;
  const expiresAt =
    typeof item.expiresAt === 'string' && item.expiresAt
      ? item.expiresAt
      : undefined;

  return { planTier, billingCycle, months, moilUserId, expiresAt };
}

const chunk = <T,>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.items)) {
      return NextResponse.json(
        { error: 'items array is required' },
        { status: 400 }
      );
    }
    if (body.items.length > MAX_ITEMS) {
      return NextResponse.json(
        { error: `items exceeds the ${MAX_ITEMS} per-request limit` },
        { status: 400 }
      );
    }

    const dryRun = body.dryRun === true;
    const force = body.force === true;
    const items = body.items as BackfillItem[];

    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Match ONLY by license id (same as /activate). Collect the ids we can act
    // on and bulk-fetch them so we don't query per item.
    const ids = new Set<string>();
    for (const it of items) {
      if (typeof it.licenseId === 'string' && it.licenseId) ids.add(it.licenseId);
    }

    const rowsById = new Map<string, LicenseRow>();
    const cols = 'id, plan_tier, billing_cycle, months, expires_at, moil_user_id';
    for (const batch of chunk([...ids], 200)) {
      const { data } = await supabase.from('licenses').select(cols).in('id', batch);
      for (const r of (data as LicenseRow[] | null) || []) rowsById.set(r.id, r);
    }

    let matched = 0;
    let updated = 0;
    let wouldUpdate = 0;
    let notFound = 0;
    let missingLicenseId = 0;
    let alreadyComplete = 0;

    for (const it of items) {
      if (typeof it.licenseId !== 'string' || !it.licenseId) {
        missingLicenseId += 1;
        continue;
      }
      const row = rowsById.get(it.licenseId);
      if (!row) {
        notFound += 1;
        continue;
      }
      matched += 1;

      const desired = resolveDesired(it);

      // Fill-if-null unless force. Only include columns that actually change.
      const patch: Record<string, string | number> = {};
      const consider = (
        col: 'plan_tier' | 'billing_cycle' | 'months' | 'expires_at' | 'moil_user_id',
        value: string | number | undefined
      ) => {
        if (value === undefined) return;
        const current = row[col];
        if (!force && current !== null && current !== undefined) return; // keep existing
        if (current === value) return; // no change
        patch[col] = value;
      };

      consider('plan_tier', desired.planTier);
      consider('billing_cycle', desired.billingCycle);
      consider('months', desired.months);
      consider('expires_at', desired.expiresAt);
      consider('moil_user_id', desired.moilUserId);

      if (Object.keys(patch).length === 0) {
        alreadyComplete += 1;
        continue;
      }

      if (dryRun) {
        wouldUpdate += 1;
        continue;
      }

      const { error: updErr } = await supabase
        .from('licenses')
        .update(patch)
        .eq('id', row.id);
      if (updErr) {
        console.error('[licenses/backfill] update failed for', row.id, updErr.message);
        continue;
      }
      updated += 1;
    }

    return NextResponse.json(
      {
        success: true,
        dryRun,
        force,
        received: items.length,
        matched,
        updated,
        wouldUpdate,
        alreadyComplete,
        notFound,
        missingLicenseId,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('License backfill error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
