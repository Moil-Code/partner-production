import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { recordAddonLicense } from '@/lib/addonLicense';
import {
  LICENSE_PLANS,
  MAX_MONTHS,
  describePlan,
  type LicensePlan,
} from '@/lib/licensePlanDefaults';
import { isMoilAdmin } from '@/lib/licenseIssuePolicy';

/**
 * Grant a time-boxed plan add-on from the Moil admin dashboard.
 *
 * A licensee already holding a license (say a partner's Starter Annual) gets,
 * for N months, a higher tier on top — Market Pro, typically, for Moil360.
 * Their base license keeps running underneath the whole time and they fall
 * back to it when the add-on lapses.
 *
 * TWO SIDES, AND THE ORDER MATTERS.
 *
 * The Moil backend owns the grant: the clock, the entitlement merge, the AI
 * credit overlay. It is called FIRST and its answer is the answer — if it
 * refuses, nothing is recorded here, because a local row for a grant that does
 * not exist is worse than no row: it tells an admin the licensee has Market
 * Pro when they do not.
 *
 * Only after it succeeds do we write the mirror row, so the dashboard shows
 * what is really in force.
 *
 * ACCESS: `moil_admin` only. A grant hands out Moil's premium AI spend, so it
 * is not a partner-admin capability — partner admins issuing their own
 * licenses go through /api/licenses/add.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized. Please login.' }, { status: 401 });
    }

    const { data: adminData, error: adminError } = await supabase
      .from('admins')
      .select('global_role, email')
      .eq('id', user.id)
      .single();

    // One definition of "Moil staff", shared with the plan-issuing policy —
    // the two must agree, or a caller who may pick any plan on /add could be
    // refused an add-on here (or the reverse).
    if (adminError || !adminData || !isMoilAdmin(adminData)) {
      return NextResponse.json(
        { error: 'Access denied. Moil admin access required.' },
        { status: 403 }
      );
    }

    const { email, planTier, months, note } = await request.json();

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }
    if (!planTier || !LICENSE_PLANS.includes(planTier as LicensePlan)) {
      return NextResponse.json(
        { error: `planTier must be one of: ${LICENSE_PLANS.join(', ')}` },
        { status: 400 }
      );
    }
    const monthsValue = Number.parseInt(String(months), 10);
    if (!Number.isInteger(monthsValue) || monthsValue < 1 || monthsValue > MAX_MONTHS) {
      return NextResponse.json(
        { error: `months must be a whole number between 1 and ${MAX_MONTHS}` },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase();

    if (!process.env.NEXT_PUBLIC_QC_API_KEY || !process.env.NEXT_PUBLIC_MOIL_PAYMENT_ACTIVATION) {
      return NextResponse.json(
        { error: 'Moil backend is not configured on this server.' },
        { status: 503 }
      );
    }

    // ── 1. Ask the Moil backend to issue the grant. It is authoritative. ──
    type MoilGrantResult = {
      email: string;
      status: string;
      plan?: string;
      expiresAt?: string;
      startsAt?: string;
      grantId?: string;
      moil_user_id?: string;
      message?: string;
    };

    let moilResult: MoilGrantResult | null = null;
    try {
      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_MOIL_PAYMENT_ACTIVATION}/api/employer/grant_plan_addon`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.NEXT_PUBLIC_QC_API_KEY,
          },
          body: JSON.stringify({
            emails: [
              {
                email: normalizedEmail,
                plan: planTier,
                billingCycle: 'monthly',
                months: monthsValue,
                ...(note ? { note } : {}),
              },
            ],
            source: 'moil_admin',
            requestedBy: user.id,
          }),
        }
      );

      const data = await resp.json();
      if (!resp.ok) {
        return NextResponse.json(
          { error: data?.message || data?.error || 'Moil backend refused the grant' },
          { status: 502 }
        );
      }
      moilResult = data?.data?.results?.[0] ?? null;
    } catch (err) {
      console.error('[grant-addon] Moil backend call failed:', err);
      // Deliberately NOT recorded locally. See the header — a mirror row for a
      // grant that was never issued is a lie the dashboard then repeats.
      return NextResponse.json(
        { error: 'Could not reach the Moil backend. Nothing was granted.' },
        { status: 502 }
      );
    }

    if (!moilResult) {
      return NextResponse.json(
        { error: 'Moil backend returned no result for this email.' },
        { status: 502 }
      );
    }

    if (moilResult.status === 'error') {
      return NextResponse.json(
        { error: moilResult.message || 'The grant could not be issued.' },
        { status: 400 }
      );
    }

    // The licensee has no Moil account yet, so the grant is parked and its
    // clock starts when they sign up. There is no end date to mirror, and
    // inventing one would put a wrong date in front of an admin.
    if (moilResult.status === 'pending_claim') {
      return NextResponse.json(
        {
          success: true,
          pending: true,
          message:
            moilResult.message ||
            'Stored. It activates when they create their Moil profile, and the clock starts then.',
          result: moilResult,
        },
        { status: 200 }
      );
    }

    // ── 2. Mirror it locally so the dashboard can show it. ──
    let recorded: { licenseId?: string; alreadyRecorded?: boolean; error?: string } = {};
    if (moilResult.expiresAt) {
      const adminSupabase = createAdminClient();
      const result = await recordAddonLicense(adminSupabase, {
        email: normalizedEmail,
        planTier: planTier as LicensePlan,
        expiresAt: moilResult.expiresAt,
        startsAt: moilResult.startsAt || null,
        moilUserId: moilResult.moil_user_id || null,
      });
      recorded = result.ok
        ? { licenseId: result.licenseId, alreadyRecorded: result.alreadyRecorded }
        : { error: result.error };

      // Best-effort — the grant is already live on the Moil side, so a failed
      // mirror costs visibility here, never the grant. Reported rather than
      // swallowed so the toast can say the dashboard may lag.
      if (!result.ok) {
        console.error('[grant-addon] mirror failed (non-fatal):', result.error);
      }
    }

    const display = describePlan(planTier as LicensePlan, 'monthly', monthsValue);

    return NextResponse.json(
      {
        success: true,
        message:
          moilResult.status === 'extended'
            ? `Extended their ${display} add-on.`
            : `${display} granted until ${new Date(moilResult.expiresAt!).toLocaleDateString()}.`,
        extended: moilResult.status === 'extended',
        expiresAt: moilResult.expiresAt,
        mirrored: !recorded.error,
        result: moilResult,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[grant-addon] error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
