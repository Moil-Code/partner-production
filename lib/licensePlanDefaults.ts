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
