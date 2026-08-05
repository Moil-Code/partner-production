import type { SupabaseClient } from '@supabase/supabase-js';
import type { LicensePlan } from './licensePlanDefaults';

/**
 * Recording a plan add-on (a time-boxed tier upgrade sitting on top of a
 * licensee's existing license).
 *
 * ONE writer, two callers:
 *   - POST /api/licenses/addon      — the Moil backend, shared-secret gated
 *   - POST /api/licenses/grant-addon — a logged-in Moil admin, session gated
 *
 * Both must produce an identical row. Two copies of this insert is how the two
 * paths end up writing subtly different rows — one inheriting the licensee's
 * partner and one not, say — with nothing to make the difference visible.
 *
 * THE MOIL BACKEND IS AUTHORITATIVE for the grant itself: it owns the clock,
 * the entitlement merge and the AI-credit overlay. This row grants nothing; it
 * exists so an admin looking at a licensee can SEE the upgrade.
 */

export interface RecordAddonInput {
  email: string;
  planTier: LicensePlan;
  expiresAt: string | Date;
  startsAt?: string | Date | null;
  moilUserId?: string | null;
  parentLicenseId?: string | null;
}

export interface RecordAddonResult {
  ok: boolean;
  alreadyRecorded?: boolean;
  licenseId?: string;
  row?: Record<string, unknown>;
  error?: string;
}

/**
 * Insert (or find) the add-on row.
 *
 * Idempotent on (email, plan_tier, expires_at): both callers can retry after a
 * network failure, and two rows describing one grant would double-count in
 * every admin view.
 */
export async function recordAddonLicense(
  // The service-role client — this writes across partners by design.
  supabase: SupabaseClient,
  input: RecordAddonInput
): Promise<RecordAddonResult> {
  const normalizedEmail = input.email.toLowerCase();
  const expiresIso = new Date(input.expiresAt).toISOString();

  // Inherit team/partner/admin from the licensee's BASE license so the add-on
  // appears in the right partner's view. Absent is fine — a founder can be
  // granted an add-on with no partner license here at all, and refusing that
  // would make this mirror stricter than the system it mirrors.
  const { data: baseLicense } = await supabase
    .from('licenses')
    .select('id, team_id, partner_id, admin_id, business_name, business_type')
    .eq('email', normalizedEmail)
    .eq('grant_kind', 'base')
    .maybeSingle();

  const { data: existing } = await supabase
    .from('licenses')
    .select('id')
    .eq('email', normalizedEmail)
    .eq('grant_kind', 'addon')
    .eq('plan_tier', input.planTier)
    .eq('expires_at', expiresIso)
    .maybeSingle();

  if (existing) {
    return { ok: true, alreadyRecorded: true, licenseId: existing.id };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('licenses')
    .insert({
      email: normalizedEmail,
      grant_kind: 'addon',
      plan_tier: input.planTier,
      starts_at: input.startsAt
        ? new Date(input.startsAt).toISOString()
        : new Date().toISOString(),
      expires_at: expiresIso,
      parent_license_id: input.parentLicenseId || baseLicense?.id || null,
      team_id: baseLicense?.team_id || null,
      partner_id: baseLicense?.partner_id || null,
      admin_id: baseLicense?.admin_id || null,
      business_name: baseLicense?.business_name || '',
      business_type: baseLicense?.business_type || '',
      // An add-on is live the moment Moil issues it — there is no separate
      // activation step, because the licensee already has an account.
      is_activated: true,
      activated_at: new Date().toISOString(),
      moil_user_id: input.moilUserId || null,
      email_status: 'not_applicable',
    })
    .select()
    .single();

  if (insertError || !inserted) {
    console.error('[addonLicense] insert failed:', insertError);
    return { ok: false, error: 'Failed to record add-on' };
  }

  return { ok: true, licenseId: inserted.id, row: inserted };
}
