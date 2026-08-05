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
  /** An identical row already existed (a retry). */
  alreadyRecorded?: boolean;
  /** A live row for this tier was moved to the new end date. */
  updated?: boolean;
  /** endOnly was set and there was nothing live to end. */
  notFound?: boolean;
  licenseId?: string;
  row?: Record<string, unknown>;
  error?: string;
}

export interface RecordAddonOptions {
  /**
   * End a live add-on instead of creating one — used when a grant is REVOKED.
   *
   * Without this, revoking left the mirror row untouched, so the dashboard
   * went on showing "Market Pro until <a future date>" for a grant that no
   * longer existed. Ending it by moving `expires_at` to now reuses the field
   * the UI already reads, so a revoked add-on and a lapsed one look the same —
   * which is what they are.
   *
   * It must never INSERT: a row created here would be a record of an add-on
   * that was cancelled, which is the opposite of the point.
   */
  endOnly?: boolean;
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
  input: RecordAddonInput,
  options: RecordAddonOptions = {}
): Promise<RecordAddonResult> {
  const normalizedEmail = input.email.toLowerCase();
  const expiresIso = new Date(input.expiresAt).toISOString();
  const nowIso = new Date().toISOString();

  // The licensee's BASE license — the partner they came in through, which the
  // Moil dashboard shows alongside the add-on.
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

  // A LIVE add-on of the same tier for the same person.
  //
  // The Moil side EXTENDS an in-force grant rather than issuing a second one,
  // so at most one add-on per tier is ever live — and the extension arrives
  // here with a new expiry. Keying idempotency on the expiry alone therefore
  // inserted a second row on every extension, and the dashboard showed one
  // person holding two Market Pro add-ons ending on different dates.
  const { data: live } = await supabase
    .from('licenses')
    .select('id')
    .eq('email', normalizedEmail)
    .eq('grant_kind', 'addon')
    .eq('plan_tier', input.planTier)
    .gt('expires_at', nowIso)
    .maybeSingle();

  if (live) {
    const { data: updated, error: updateError } = await supabase
      .from('licenses')
      .update({
        expires_at: expiresIso,
        ...(input.startsAt
          ? { starts_at: new Date(input.startsAt).toISOString() }
          : {}),
      })
      .eq('id', live.id)
      .select()
      .single();

    if (updateError) {
      console.error('[addonLicense] update failed:', updateError);
      return { ok: false, error: 'Failed to update add-on' };
    }
    return { ok: true, updated: true, licenseId: live.id, row: updated };
  }

  if (options.endOnly) {
    // Nothing live to end. Not an error — the grant may have lapsed already,
    // or never been mirrored.
    return { ok: true, notFound: true };
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

      // ── INVISIBLE TO THE PARTNER, ON PURPOSE. ────────────────────────────
      //
      // An add-on is something MOIL gives a founder; the partner did not issue
      // it, is not billed for it, and must not see it. Every partner-facing
      // read — /api/licenses/list, /stats, /export, the admin dashboard —
      // scopes by `team_id` (or `admin_id` when the admin has no team), so
      // leaving both NULL is what keeps these rows out of those views. It is
      // also why they can never touch a partner's seat maths.
      //
      // `partner_id` IS kept: the Moil dashboard shows which partner the
      // founder originally came in through, and the moil-admin licenses page
      // is scoped by partner_id, so this is what makes the add-on visible
      // there and nowhere else.
      team_id: null,
      admin_id: null,
      partner_id: baseLicense?.partner_id || null,
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
