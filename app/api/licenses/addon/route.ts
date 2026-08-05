import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { LICENSE_PLANS, type LicensePlan } from '@/lib/licensePlanDefaults';
import { recordAddonLicense } from '@/lib/addonLicense';

/**
 * Mirror a time-boxed plan grant (add-on) issued by the Moil backend.
 *
 * A founder already holding a license can be given a temporary tier upgrade on
 * top of it — two months of Market Pro over a standard annual partner license
 * — with the base license running underneath the whole time.
 *
 * THE MOIL BACKEND IS AUTHORITATIVE. It owns the clock, the entitlement merge
 * and the credit overlay; nothing here grants access to anything. These rows
 * exist so an admin looking at a licensee can SEE the upgrade, which is the
 * same role `licenses` already plays for base plans.
 *
 * AUTH: a shared secret, unlike the sibling /activate route.
 *
 * That asymmetry is deliberate. /activate mutates a row that a partner admin
 * already created — the licenseId is the capability. This endpoint CREATES
 * rows, so leaving it open would let anyone who can reach the host write
 * arbitrary licence records against any email. It FAILS CLOSED when the
 * secret is unconfigured: a missing key must never mean "allow everyone",
 * regardless of environment.
 *
 * Idempotent on (email, plan_tier, expires_at) so a retry from the caller
 * cannot leave two rows describing one grant.
 *
 * A `note` may be sent for caller symmetry and is deliberately ignored:
 * `licenses` has no free-text column, and adding one for a mirror row is not
 * worth a migration. The Moil-side grant carries it.
 */
export async function POST(request: Request) {
  try {
    const expectedKey = process.env.MOIL_INTERNAL_API_KEY;
    if (!expectedKey) {
      console.error(
        '[licenses/addon] MOIL_INTERNAL_API_KEY not configured — refusing all requests.'
      );
      return NextResponse.json(
        { error: 'Add-on endpoint is not configured on this server.' },
        { status: 503 }
      );
    }

    const providedKey =
      request.headers.get('x-internal-api-key') || request.headers.get('x-api-key');
    if (providedKey !== expectedKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      email,
      planTier,
      startsAt,
      expiresAt,
      moilUserId,
      parentLicenseId,
    } = await request.json();

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json(
        { error: 'A valid email is required' },
        { status: 400 }
      );
    }
    if (!planTier || !LICENSE_PLANS.includes(planTier as LicensePlan)) {
      return NextResponse.json(
        { error: `planTier must be one of: ${LICENSE_PLANS.join(', ')}` },
        { status: 400 }
      );
    }
    // An add-on with no end date is not an add-on. Every reader on the Moil
    // side treats a missing expiry as inactive, so a row without one would
    // look like an upgrade and mean nothing.
    if (!expiresAt || Number.isNaN(Date.parse(expiresAt))) {
      return NextResponse.json(
        { error: 'expiresAt is required and must be a valid date' },
        { status: 400 }
      );
    }

    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const result = await recordAddonLicense(supabase, {
      email,
      planTier: planTier as LicensePlan,
      expiresAt,
      startsAt,
      moilUserId: typeof moilUserId === 'string' ? moilUserId : null,
      parentLicenseId: parentLicenseId || null,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || 'Failed to record add-on' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        ...(result.alreadyRecorded ? { alreadyRecorded: true } : {}),
        license: result.row
          ? {
              id: result.row.id,
              email: result.row.email,
              grant_kind: result.row.grant_kind,
              plan_tier: result.row.plan_tier,
              starts_at: result.row.starts_at,
              expires_at: result.row.expires_at,
              parent_license_id: result.row.parent_license_id,
            }
          : { id: result.licenseId },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[licenses/addon] error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
