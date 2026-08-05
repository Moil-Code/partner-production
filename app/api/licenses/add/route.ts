import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import {
  sendLicenseActivationEmail,
  sendLicenseClaimEmail,
  sendLicenseActivatedEmail,
  type EdcEmailInfo,
} from '@/lib/email';
import {
  parsePlanKey,
  describePlan,
  planRank,
  type LicensePlan,
  type BillingCycle,
} from '@/lib/licensePlanDefaults';
import { resolveIssuablePlan, isMoilAdmin } from '@/lib/licenseIssuePolicy';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, upgrade } = body;

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Valid email address is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized. Please login.' }, { status: 401 });
    }

    const { data: adminData, error: adminError } = await supabase
      .from('admins')
      .select('*, partner:partners(id, name, program_name, logo_url, logo_initial, primary_color, support_email)')
      .eq('id', user.id)
      .single();

    if (adminError || !adminData) {
      return NextResponse.json({ error: 'Access denied. Admin account required.' }, { status: 403 });
    }

    // Which plan this caller is allowed to issue. Partners issue Starter
    // Annual and only that; Moil staff pick. Enforced server-side because the
    // partner dashboard simply not rendering a picker is not a control — see
    // lib/licenseIssuePolicy.ts.
    const planResolution = resolveIssuablePlan(adminData, {
      plan: body.plan,
      billingCycle: body.billingCycle,
      months: body.months,
    });
    if (!planResolution.ok) {
      return NextResponse.json(
        { error: planResolution.error },
        { status: planResolution.status }
      );
    }
    const planDefaults = planResolution.defaults;
    const planDisplay = describePlan(
      planDefaults.plan,
      planDefaults.billingCycle,
      planDefaults.months
    );

    const partnerInfo = adminData.partner as {
      id: string;
      name: string;
      program_name?: string;
      logo_url?: string;
      logo_initial?: string;
      primary_color?: string;
      support_email?: string;
    } | null;

    const partnerName = partnerInfo?.program_name || partnerInfo?.name || 'Moil Partners';
    const orgSlug = (partnerInfo?.name || 'moil-partners').replace(/\s+/g, '-');

    const edcInfo: EdcEmailInfo = {
      programName: partnerInfo?.program_name || partnerInfo?.name || 'Moil Partners',
      fullName: partnerInfo?.name || 'Moil Partners',
      logo: partnerInfo?.logo_url || undefined,
      logoInitial: partnerInfo?.logo_initial || partnerInfo?.name?.charAt(0) || 'M',
      primaryColor: partnerInfo?.primary_color || '#5843BE',
      supportEmail: partnerInfo?.support_email || 'support@moilapp.com',
      licenseDuration: '12 months',
    };

    const { data: teamMember } = await supabase
      .from('team_members')
      .select('team_id, team:teams(id, purchased_license_count)')
      .eq('admin_id', user.id)
      .single();

    const teamId = teamMember?.team_id;
    const team = teamMember?.team as unknown as { id: string; purchased_license_count: number } | null;

    // Global duplicate check — BASE licenses only.
    //
    // Add-on rows (grant_kind = 'addon') are time-boxed tier upgrades sitting
    // on top of a licensee's existing license, and they live in this same
    // table. An unscoped check would refuse to issue a base license to anyone
    // who has ever held an add-on, and — read the other way — the add-on flow
    // could never target someone who already has a license, which is every
    // single person an add-on is for.
    const adminSupabase = createAdminClient();
    const { data: globalLicense } = await adminSupabase
      .from('licenses')
      .select('id, plan_tier, billing_cycle, months, is_activated, team_id, admin_id')
      .eq('email', email.toLowerCase())
      .eq('grant_kind', 'base')
      .maybeSingle();

    // ── Already licensed? Offer an UPGRADE instead of a dead end. ──────────
    //
    // This used to be a flat refusal, which meant a licensee could never be
    // moved up a tier from here — the only path was contacting support. The
    // Moil backend has always handled the upgrade itself (it compares tier
    // rank and re-enrolls, or answers `blocked_downgrade`); nothing in this
    // app ever asked it to.
    //
    // An upgrade is not applied silently: it costs money and changes someone's
    // plan, so the first call returns a typed 409 describing the change and the
    // caller has to come back with `upgrade: true`.
    // ── Tenancy. The lookup above is GLOBAL by design (that is what makes the
    // duplicate check global), so it can return a license belonging to a
    // different partner. Upgrading it would mutate another tenant's row —
    // through the service-role client, which bypasses RLS — and the 409 below
    // would disclose that tenant's plan. A partner may only upgrade a licensee
    // that is theirs; Moil staff are cross-partner by definition.
    const callerOwnsLicense =
      !!globalLicense &&
      (isMoilAdmin(adminData) ||
        (teamId
          ? globalLicense.team_id === teamId
          : globalLicense.admin_id === user.id));

    if (globalLicense && !callerOwnsLicense) {
      // The original generic refusal, deliberately naming no plan.
      return NextResponse.json(
        {
          error:
            'This email already has a license allocated. If this is a mistake, please contact cs@moilapp.com',
          code: 'LICENSE_EXISTS',
          upgradable: false,
        },
        { status: 409 }
      );
    }

    const isUpgrade = !!globalLicense && callerOwnsLicense && upgrade === true;

    if (globalLicense) {
      const currentRank = planRank(globalLicense.plan_tier, globalLicense.billing_cycle);
      const requestedRank = planRank(planDefaults.plan, planDefaults.billingCycle);
      const currentDisplay = globalLicense.plan_tier
        ? describePlan(
            globalLicense.plan_tier as LicensePlan,
            (globalLicense.billing_cycle as BillingCycle) || 'yearly',
            globalLicense.months ?? undefined
          )
        : 'an existing license';

      // Same tier or lower. Refused rather than attempted: the Moil backend
      // blocks downgrades through this path anyway, so "applying" it would
      // report success and change nothing.
      if (requestedRank <= currentRank) {
        return NextResponse.json(
          {
            error:
              requestedRank === currentRank
                ? `This email already has ${currentDisplay}.`
                : `This email already has ${currentDisplay}, which is higher than ${planDisplay}. Downgrades are not supported here.`,
            code: 'LICENSE_EXISTS',
            upgradable: false,
            currentPlan: {
              planTier: globalLicense.plan_tier,
              billingCycle: globalLicense.billing_cycle,
              months: globalLicense.months,
              display: currentDisplay,
            },
          },
          { status: 409 }
        );
      }

      // A real upgrade, but not yet confirmed.
      if (!isUpgrade) {
        return NextResponse.json(
          {
            error: `This email already has ${currentDisplay}. Upgrade them to ${planDisplay}?`,
            code: 'UPGRADE_AVAILABLE',
            upgradable: true,
            licenseId: globalLicense.id,
            currentPlan: {
              planTier: globalLicense.plan_tier,
              billingCycle: globalLicense.billing_cycle,
              months: globalLicense.months,
              display: currentDisplay,
            },
            requestedPlan: {
              planTier: planDefaults.plan,
              billingCycle: planDefaults.billingCycle,
              months: planDefaults.months ?? null,
              display: planDisplay,
            },
          },
          { status: 409 }
        );
      }
    }

    // Team capacity check — add-ons do not consume a seat.
    // An add-on upgrades someone who already holds a license, so counting it
    // would charge a partner twice for the same person.
    // Skipped on an upgrade: the licensee already occupies their seat, and
    // charging a second one for moving them up a tier would be wrong.
    if (!isUpgrade && teamId && team) {
      const { count: assignedCount } = await supabase
        .from('licenses')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId)
        .eq('grant_kind', 'base');

      const available = (team.purchased_license_count || 0) - (assignedCount || 0);
      if (available <= 0) {
        return NextResponse.json(
          { error: 'No available licenses. Please purchase more licenses.' },
          { status: 400 }
        );
      }
    }

    // An upgrade REUSES the existing row. Inserting a second one would double
    // every count in the dashboard and leave two rows disagreeing about which
    // plan the licensee is on.
    const planColumns = {
      plan_tier: planDefaults.plan,
      billing_cycle: planDefaults.billingCycle,
      months: planDefaults.months ?? null,
    };

    let license: { id: string; email: string; created_at: string };

    if (isUpgrade && globalLicense) {
      const { data: updated, error: updateError } = await adminSupabase
        .from('licenses')
        .update({ ...planColumns, performed_by: user.id })
        .eq('id', globalLicense.id)
        .select()
        .single();

      if (updateError || !updated) {
        console.error('License upgrade error:', updateError);
        return NextResponse.json({ error: 'Failed to upgrade license' }, { status: 500 });
      }
      license = updated;
    } else {
      const { data: created, error: licenseError } = await supabase
        .from('licenses')
        .insert({
          admin_id: user.id,
          email: email.toLowerCase(),
          business_name: '',
          business_type: '',
          is_activated: false,
          team_id: teamId || null,
          performed_by: user.id,
          grant_kind: 'base',
          ...planColumns,
        })
        .select()
        .single();

      if (licenseError || !created) {
        console.error('License creation error:', licenseError);
        return NextResponse.json({ error: 'Failed to create license' }, { status: 500 });
      }
      license = created;
    }

    // Call the Moil backend to grant / upgrade the standard_yearly plan.
    // The licenseId lets the backend back-fill business_name/type for
    // already-registered users. source tracks which partner issued the license.
    type MoilResult = {
      license_status: string;
      has_account?: boolean;
      // Optional fields — newer Moil backend versions include these.
      plan?: string;
      expiresAt?: string;
      moil_user_id?: string;
    };
    let moilResult: MoilResult | null = null;

    try {
      if (process.env.NEXT_PUBLIC_QC_API_KEY) {
        const resp = await fetch(
          `${process.env.NEXT_PUBLIC_MOIL_PAYMENT_ACTIVATION}/api/employer/activate_license`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': process.env.NEXT_PUBLIC_QC_API_KEY,
            },
            body: JSON.stringify({
              emails: [{ email: email.toLowerCase(), licenseId: license.id }],
              defaults: planDefaults,
              source: partnerInfo?.name || 'moil',
              requestedBy: user.id,
            }),
          }
        );

        if (resp.ok) {
          const data = await resp.json();
          if (data.data?.results?.length > 0) {
            moilResult = data.data.results[0] as MoilResult;
          }
        }
      }
    } catch (err) {
      console.error('Moil activate_license call failed (non-fatal):', err);
    }

    // Persist optional Moil-reported metadata (moil_user_id / expiry / resolved plan).
    if (moilResult?.moil_user_id || moilResult?.expiresAt || moilResult?.plan) {
      const resolvedPlan = parsePlanKey(moilResult.plan);
      const metadataUpdate: Record<string, string> = {
        ...(moilResult.moil_user_id ? { moil_user_id: moilResult.moil_user_id } : {}),
        ...(moilResult.expiresAt ? { expires_at: moilResult.expiresAt } : {}),
        ...(resolvedPlan
          ? { plan_tier: resolvedPlan.planTier, billing_cycle: resolvedPlan.billingCycle }
          : {}),
      };
      const { error: metadataError } = await supabase
        .from('licenses')
        .update(metadataUpdate)
        .eq('id', license.id);
      if (metadataError) {
        console.error('Failed to persist Moil license metadata (non-fatal):', metadataError);
      }
    }

    const status = moilResult?.license_status;
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://business.moilapp.com'}/login?ref=moilPartners&org=${orgSlug}`;
    const activationUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://business.moilapp.com'}/register?licenseId=${license.id}&ref=moilPartners&org=${orgSlug}`;

    let emailStatus = 'pending';
    let messageId: string | undefined;

    if (status === 'activated') {
      // User had a profile — plan was applied directly. Send "your license is active" email.
      await supabase
        .from('licenses')
        .update({ is_activated: true, email_status: 'skipped', activated_at: new Date().toISOString() })
        .eq('id', license.id);

      const r = await sendLicenseActivatedEmail({
        email: license.email,
        loginUrl,
        partnerName,
        planName: planDisplay,
        edc: edcInfo,
      });
      emailStatus = r.success ? 'sent' : 'failed';
      messageId = r.messageId;

    } else if (status === 'pending_invite' && moilResult?.has_account === true) {
      // User exists on Moil but has no employer profile yet. Send "create your profile" email.
      const r = await sendLicenseClaimEmail({
        email: license.email,
        loginUrl,
        partnerName,
        edc: edcInfo,
      });
      emailStatus = r.success ? 'sent' : 'failed';
      messageId = r.messageId;

    } else if (status === 'already_assigned' || status === 'blocked_downgrade') {
      // User is already on same or higher plan — partner license row was back-filled by Moil backend.
      await supabase
        .from('licenses')
        .update({ is_activated: true, email_status: 'skipped', activated_at: new Date().toISOString() })
        .eq('id', license.id);
      emailStatus = 'skipped';

    } else {
      // No account on Moil (pending_invite has_account: false) OR Moil call failed.
      // Send the standard activation email with the register link.
      const r = await sendLicenseActivationEmail({
        email: license.email,
        activationUrl,
        adminName: `${adminData.first_name} ${adminData.last_name}`,
        edc: edcInfo,
      });
      emailStatus = r.success ? 'sent' : 'failed';
      messageId = r.messageId;
    }

    // Persist email tracking
    await supabase
      .from('licenses')
      .update({
        email_status: emailStatus,
        ...(messageId ? { message_id: messageId } : {}),
      })
      .eq('id', license.id);

    if (teamMember?.team_id) {
      await supabase.rpc('log_activity', {
        p_team_id: teamMember.team_id,
        p_admin_id: user.id,
        p_activity_type: isUpgrade ? 'license_upgraded' : 'license_added',
        p_description: isUpgrade
          ? `Upgraded ${email.toLowerCase()} to ${planDisplay}`
          : `Added ${planDisplay} license for ${email.toLowerCase()}`,
        p_metadata: {
          license_id: license.id,
          email: email.toLowerCase(),
          plan_tier: planDefaults.plan,
          billing_cycle: planDefaults.billingCycle,
          ...(isUpgrade ? { upgraded: true } : {}),
        },
      });
    }

    return NextResponse.json(
      {
        message: isUpgrade
          ? `Upgraded to ${planDisplay}`
          : 'License added successfully',
        upgraded: isUpgrade,
        license: {
          id: license.id,
          email: license.email,
          isActivated: status === 'activated' || status === 'already_assigned' || status === 'blocked_downgrade',
          moilStatus: status || 'pending',
          planTier: planDefaults.plan,
          billingCycle: planDefaults.billingCycle,
          planDisplay,
          createdAt: license.created_at,
        },
      },
      // An upgrade mutates an existing row, so 200 rather than 201.
      { status: isUpgrade ? 200 : 201 }
    );
  } catch (error) {
    console.error('Add license error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
