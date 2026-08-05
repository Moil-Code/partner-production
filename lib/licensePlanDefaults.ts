export const LICENSE_PLANS = ['standard', 'professional', 'market_pro'] as const;
export type LicensePlan = (typeof LICENSE_PLANS)[number];

export const BILLING_CYCLES = ['yearly', 'monthly'] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const MAX_MONTHS = 12;

export interface LicensePlanDefaults {
  plan: LicensePlan;
  billingCycle: BillingCycle;
  months?: number;
}

export type ParseResult =
  | { ok: true; defaults: LicensePlanDefaults }
  | { ok: false; error: string };

/**
 * Parse and validate plan/billingCycle/months from a request payload.
 * Accepts unknown to defend against arbitrary client input.
 *
 * Rules (mirrored from external /api/employer/activate_license schema):
 *   - plan must be one of LICENSE_PLANS
 *   - billingCycle must be one of BILLING_CYCLES
 *   - if billingCycle === 'monthly', months is required (1..MAX_MONTHS)
 *   - if billingCycle === 'yearly', months is dropped from the result
 */
/**
 * Parse a resolved Moil plan key like 'standard_yearly' or
 * 'market_pro_monthly' into { planTier, billingCycle }.
 * Returns null when the key doesn't match a known tier + cycle.
 */
/**
 * Founder-facing plan names. Used in emails and in the upgrade confirmation,
 * where "market_pro" in front of an admin about to spend money is not good
 * enough.
 */
export const PLAN_DISPLAY_NAMES: Record<LicensePlan, string> = {
  standard: 'Starter',
  professional: 'Professional',
  market_pro: 'Market Pro',
};

export function describePlan(
  plan: LicensePlan,
  billingCycle: BillingCycle,
  months?: number
): string {
  const tier = PLAN_DISPLAY_NAMES[plan] || plan;
  if (billingCycle === 'yearly') return `${tier} Annual`;
  if (months && months > 1) return `${tier} — ${months} months`;
  return `${tier} Monthly`;
}

/**
 * Tier ordering, used to tell an UPGRADE from a downgrade.
 *
 * MUST match Moil-codeStagingBackend/utils/planEntitlement.js → planRank,
 * which is what the Moil backend uses to decide whether to re-enroll a
 * licensee or refuse with `blocked_downgrade`. If these two disagree, this app
 * offers an upgrade the backend then silently refuses — the admin sees a
 * success toast and nothing changes.
 *
 * Within a tier, yearly ranks half a step above monthly, so moving a monthly
 * licensee to the annual plan of the same tier counts as an upgrade.
 */
const TIER_RANK: Record<LicensePlan, number> = {
  standard: 1,
  professional: 2,
  market_pro: 3,
};

export function planRank(
  plan: unknown,
  billingCycle?: unknown
): number {
  if (typeof plan !== 'string' || !(plan in TIER_RANK)) return -1;
  const base = TIER_RANK[plan as LicensePlan];
  return base + (billingCycle === 'yearly' ? 0.5 : 0);
}

export function parsePlanKey(
  planKey: unknown
): { planTier: LicensePlan; billingCycle: BillingCycle } | null {
  if (typeof planKey !== 'string' || !planKey) return null;
  const normalized = planKey.trim().toLowerCase();
  for (const cycle of BILLING_CYCLES) {
    const suffix = `_${cycle}`;
    if (normalized.endsWith(suffix)) {
      const tier = normalized.slice(0, -suffix.length);
      if (LICENSE_PLANS.includes(tier as LicensePlan)) {
        return { planTier: tier as LicensePlan, billingCycle: cycle };
      }
    }
  }
  return null;
}

export function parseLicensePlanDefaults(input: unknown): ParseResult {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Plan defaults are required' };
  }

  const { plan, billingCycle, months } = input as Record<string, unknown>;

  if (typeof plan !== 'string' || !LICENSE_PLANS.includes(plan as LicensePlan)) {
    return {
      ok: false,
      error: `plan must be one of: ${LICENSE_PLANS.join(', ')}`,
    };
  }

  if (
    typeof billingCycle !== 'string' ||
    !BILLING_CYCLES.includes(billingCycle as BillingCycle)
  ) {
    return {
      ok: false,
      error: `billingCycle must be one of: ${BILLING_CYCLES.join(', ')}`,
    };
  }

  if (billingCycle === 'monthly') {
    const n =
      typeof months === 'number'
        ? months
        : typeof months === 'string'
          ? Number.parseInt(months, 10)
          : NaN;
    if (!Number.isInteger(n) || n < 1 || n > MAX_MONTHS) {
      return {
        ok: false,
        error: `months must be an integer between 1 and ${MAX_MONTHS} when billingCycle is monthly`,
      };
    }
    return {
      ok: true,
      defaults: {
        plan: plan as LicensePlan,
        billingCycle: 'monthly',
        months: n,
      },
    };
  }

  // yearly: explicitly omit months per external schema
  return {
    ok: true,
    defaults: {
      plan: plan as LicensePlan,
      billingCycle: 'yearly',
    },
  };
}
