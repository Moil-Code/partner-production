import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import {
  sendLicenseActivationEmail,
  sendLicenseClaimEmail,
  sendLicenseActivatedEmail,
  type EdcEmailInfo,
} from '@/lib/email';

// All partner-issued licenses grant exactly this plan.
const PARTNER_PLAN_DEFAULTS = { plan: 'standard', billingCycle: 'yearly' };
const PARTNER_PLAN_DISPLAY = 'Standard Annual';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = body;

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

    // Global duplicate check
    const adminSupabase = createAdminClient();
    const { data: globalLicense } = await adminSupabase
      .from('licenses')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (globalLicense) {
      return NextResponse.json(
        { error: 'This email already has a license allocated. If this is a mistake, please contact cs@moilapp.com' },
        { status: 400 }
      );
    }

    // Team capacity check
    if (teamId && team) {
      const { count: assignedCount } = await supabase
        .from('licenses')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId);

      const available = (team.purchased_license_count || 0) - (assignedCount || 0);
      if (available <= 0) {
        return NextResponse.json(
          { error: 'No available licenses. Please purchase more licenses.' },
          { status: 400 }
        );
      }
    }

    // Create the license row first so we can pass its ID to the Moil backend.
    const { data: license, error: licenseError } = await supabase
      .from('licenses')
      .insert({
        admin_id: user.id,
        email: email.toLowerCase(),
        business_name: '',
        business_type: '',
        is_activated: false,
        team_id: teamId || null,
        performed_by: user.id,
      })
      .select()
      .single();

    if (licenseError) {
      console.error('License creation error:', licenseError);
      return NextResponse.json({ error: 'Failed to create license' }, { status: 500 });
    }

    // Call the Moil backend to grant / upgrade the standard_yearly plan.
    // The licenseId lets the backend back-fill business_name/type for
    // already-registered users. source tracks which partner issued the license.
    type MoilResult = { license_status: string; has_account?: boolean };
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
              defaults: PARTNER_PLAN_DEFAULTS,
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

    const status = moilResult?.license_status;
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://business.moilapp.com'}/login`;
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
        planName: PARTNER_PLAN_DISPLAY,
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
        p_activity_type: 'license_added',
        p_description: `Added license for ${email.toLowerCase()}`,
        p_metadata: { license_id: license.id, email: email.toLowerCase() },
      });
    }

    return NextResponse.json(
      {
        message: 'License added successfully',
        license: {
          id: license.id,
          email: license.email,
          isActivated: status === 'activated' || status === 'already_assigned' || status === 'blocked_downgrade',
          moilStatus: status || 'pending',
          createdAt: license.created_at,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Add license error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
