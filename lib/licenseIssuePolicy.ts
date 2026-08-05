import {
  parseLicensePlanDefaults,
  type LicensePlan,
  type BillingCycle,
  type LicensePlanDefaults,
} from './licensePlanDefaults';

/**
 * WHO MAY ISSUE WHICH PLAN.
 *
 * This is a product rule, not a technical one, and it is the reason
 * /api/licenses/add spent a long time with `standard`/`yearly` hardcoded:
 *
 *   • PARTNERS issue exactly one thing — Starter Annual. That is what their
 *     agreement covers and what their seats are priced against. Their own
 *     dashboard has no plan picker, and that is deliberate.
 *
 *   • MOIL STAFF choose the plan. The Moil admin dashboard has a plan picker
 *     for exactly this reason.
 *
 * The rule used to live as a hardcoded constant, which enforced it perfectly
 * for partners but also silently discarded the Moil admin picker's value —
 * every license Moil issued came out Starter Annual whatever was selected.
 * Reading the plan from the request fixed that half and broke the other:
 * nothing then stopped a partner-admin request naming `market_pro`, since the
 * UI not offering a control is not a control.
 *
 * So the rule is enforced here, server-side, once, and both routes that accept
 * a plan (`/add`, `/import`) go through it.
 */

/** The one plan a partner may issue. */
export const PARTNER_PLAN_DEFAULTS: LicensePlanDefaults = {
  plan: 'standard',
  billingCycle: 'yearly',
};

export interface AdminRoleRow {
  global_role?: string | null;
  email?: string | null;
}

/**
 * Moil staff, by role or by address.
 *
 * The `@moilapp.com` clause mirrors `lib/stores/authStore.ts` and the
 * moil-admin API routes: this app has always treated a Moil address as
 * implicitly `moil_admin`, and a stricter check here would lock staff out of
 * the picker their own dashboard renders.
 */
export function isMoilAdmin(admin: AdminRoleRow | null | undefined): boolean {
  if (!admin) return false;
  if (admin.global_role === 'moil_admin') return true;
  return (admin.email || '').toLowerCase().endsWith('@moilapp.com');
}

export type IssuablePlanResult =
  | { ok: true; defaults: LicensePlanDefaults }
  | { ok: false; error: string; status: 400 | 403 };

interface RequestedPlan {
  plan?: unknown;
  billingCycle?: unknown;
  months?: unknown;
}

/**
 * Resolve the plan a caller is allowed to issue.
 *
 * A partner asking for a plan they may not issue is REFUSED, not quietly
 * downgraded to Starter. Silently substituting would report success for a
 * request we did not carry out, and the licensee would be on a different plan
 * from the one the admin believes they bought — which nobody discovers until
 * a founder asks why Moil360 is locked.
 *
 * A caller echoing the partner default back is fine; that is not an attempt to
 * pick anything.
 */
export function resolveIssuablePlan(
  admin: AdminRoleRow | null | undefined,
  requested: RequestedPlan
): IssuablePlanResult {
  const askedForPlan =
    requested.plan !== undefined &&
    requested.plan !== null &&
    requested.plan !== '';
  const askedForCycle =
    requested.billingCycle !== undefined &&
    requested.billingCycle !== null &&
    requested.billingCycle !== '';

  if (!askedForPlan && !askedForCycle) {
    return { ok: true, defaults: { ...PARTNER_PLAN_DEFAULTS } };
  }

  const parsed = parseLicensePlanDefaults({
    plan: requested.plan,
    billingCycle: requested.billingCycle,
    months: requested.months,
  });
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, status: 400 };
  }

  if (isMoilAdmin(admin)) {
    return { ok: true, defaults: parsed.defaults };
  }

  // Not Moil staff. Only the partner plan is permitted.
  const isPartnerPlan =
    parsed.defaults.plan === PARTNER_PLAN_DEFAULTS.plan &&
    parsed.defaults.billingCycle === PARTNER_PLAN_DEFAULTS.billingCycle;

  if (isPartnerPlan) {
    return { ok: true, defaults: { ...PARTNER_PLAN_DEFAULTS } };
  }

  return {
    ok: false,
    error:
      'Partner licenses are issued as Starter Annual. Contact Moil to arrange a different plan.',
    status: 403,
  };
}

export type { LicensePlan, BillingCycle, LicensePlanDefaults };
