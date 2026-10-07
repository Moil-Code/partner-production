import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { recordAddonLicense } from '@/lib/addonLicense';
import { LICENSE_PLANS, type LicensePlan } from '@/lib/licensePlanDefaults';
import { resolveLicenseActor } from '@/lib/licenses/access';

/**
 * Remove a plan add-on now and put the licensee back on their own license.
 *
 * An add-on ends by itself on its expiry date; this is the early exit for a
 * grant issued in error or a window that is no longer wanted.
 *
 * THE MOIL BACKEND IS AUTHORITATIVE, same as granting. It is called FIRST: it
 * marks the grant revoked (access reverts at once — every reader resolves the
 * grant against its status and expiry), restores the base plan's AI credits in
 * Supabase, and clears the cached profile in Redis. Only after that do we end
 * the mirror row here, so the dashboard never shows "revoked" for a grant that
 * is still live.
 *
 * The licensee's BASE license is never touched. An add-on sits beside it, so
 * "roll back" means removing the overlay, not re-enrolling a plan.
 *
 * ACCESS: Moil admins (any licensee) and PARTNER ADMINS (their own licensees
 * only). Granting stays Moil-only because it spends Moil's AI budget; removing
 * only ever takes access away, so a partner may end an add-on on a person they
 * licensed. "Their own" is decided from the licensee's BASE license — add-on
 * rows carry no team or admin, so they cannot be scoped directly — using the
 * same team/admin scoping every other license mutation here uses. Anything
 * outside that scope answers 404, never 403, so the route cannot be used to
 * probe which emails hold licenses elsewhere.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const actorRes = await resolveLicenseActor(supabase);
    if (!actorRes.ok) {
      return NextResponse.json({ error: actorRes.error }, { status: actorRes.status });
    }
    const { actor } = actorRes;

    const { email, planTier } = await request.json();

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }
    // Optional: narrows the removal to one tier. Anything unrecognised is
    // refused rather than ignored — ignoring it would remove EVERY add-on.
    if (planTier !== undefined && planTier !== null && planTier !== '') {
      if (!LICENSE_PLANS.includes(planTier as LicensePlan)) {
        return NextResponse.json(
          { error: `planTier must be one of: ${LICENSE_PLANS.join(', ')}` },
          { status: 400 }
        );
      }
    }
    const tier = planTier ? (planTier as LicensePlan) : null;
    const normalizedEmail = email.toLowerCase();

    // Partner admins: the licensee's base license must be in their scope.
    if (!actor.isMoilAdmin) {
      let scope = createAdminClient()
        .from('licenses')
        .select('id')
        .eq('email', normalizedEmail)
        .eq('grant_kind', 'base');
      scope = actor.teamId
        ? scope.eq('team_id', actor.teamId)
        : scope.eq('admin_id', actor.userId);
      const { data: ownBase, error: scopeError } = await scope.limit(1);
      if (scopeError) {
        console.error('[revoke-addon] scope lookup failed:', scopeError);
        return NextResponse.json({ error: 'Could not verify access. Nothing was removed.' }, { status: 503 });
      }
      if (!ownBase || ownBase.length === 0) {
        return NextResponse.json(
          { error: 'This person has no active add-on to remove.', code: 'NO_ACTIVE_ADDON' },
          { status: 404 }
        );
      }
    }

    if (!process.env.NEXT_PUBLIC_QC_API_KEY || !process.env.NEXT_PUBLIC_MOIL_PAYMENT_ACTIVATION) {
      return NextResponse.json(
        { error: 'Moil backend is not configured on this server.' },
        { status: 503 }
      );
    }

    // ── 1. Ask the Moil backend to revoke. It is authoritative. ──
    type RevokeResult = {
      grantId: string;
      plan?: string;
      credit_restore?: string;
      partner_mirror?: string;
      base_plan?: string | null;
    };
    let revoked = 0;
    let results: RevokeResult[] = [];
    try {
      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_MOIL_PAYMENT_ACTIVATION}/api/employer/revoke_plan_addon`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.NEXT_PUBLIC_QC_API_KEY,
          },
          body: JSON.stringify({
            email: normalizedEmail,
            ...(tier ? { planTier: tier } : {}),
            revokedBy: actor.userId,
          }),
        }
      );
      const data = await resp.json();
      if (!resp.ok) {
        return NextResponse.json(
          { error: data?.message || data?.error || 'Moil backend refused the removal' },
          { status: 502 }
        );
      }
      revoked = Number(data?.data?.revoked) || 0;
      results = Array.isArray(data?.data?.results) ? data.data.results : [];
    } catch (err) {
      console.error('[revoke-addon] Moil backend call failed:', err);
      // Nothing is changed locally: ending the mirror row for a grant that is
      // still live would tell an admin the founder is back on their base plan
      // when they are not.
      return NextResponse.json(
        { error: 'Could not reach the Moil backend. Nothing was removed.' },
        { status: 502 }
      );
    }

    if (revoked === 0) {
      return NextResponse.json(
        {
          error: 'This person has no active add-on to remove.',
          code: 'NO_ACTIVE_ADDON',
        },
        { status: 404 }
      );
    }

    // ── 2. End the mirror row(s). Idempotent; the backend usually did it. ──
    const adminSupabase = createAdminClient();
    const tiers = new Set<LicensePlan>();
    if (tier) tiers.add(tier);
    else {
      const { data: live } = await adminSupabase
        .from('licenses')
        .select('plan_tier')
        .eq('email', normalizedEmail)
        .eq('grant_kind', 'addon')
        .gt('expires_at', new Date().toISOString());
      for (const r of live || []) {
        if (r.plan_tier && LICENSE_PLANS.includes(r.plan_tier as LicensePlan)) {
          tiers.add(r.plan_tier as LicensePlan);
        }
      }
    }

    let mirrorFailed = false;
    for (const t of tiers) {
      const r = await recordAddonLicense(
        adminSupabase,
        { email: normalizedEmail, planTier: t, expiresAt: new Date() },
        { endOnly: true }
      );
      if (!r.ok) {
        mirrorFailed = true;
        console.error('[revoke-addon] mirror end failed (non-fatal):', r.error);
      }
    }

    // The grant is gone either way, but credits are a separate write. Say so
    // rather than reporting a clean rollback over a founder still holding the
    // higher AI allowance.
    const creditsFailed = results.some((r) => r.credit_restore === 'failed');
    const message = creditsFailed
      ? 'Add-on removed and access is back to their own license, but their AI credit allowance did not reset yet. Press Remove again to retry.'
      : 'Add-on removed. They are back on their own license.';

    return NextResponse.json(
      {
        success: true,
        message,
        revoked,
        creditsRestored: !creditsFailed,
        mirrored: !mirrorFailed,
        results,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[revoke-addon] error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
