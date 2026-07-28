import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendLicenseActivationEmail, type EdcEmailInfo } from '@/lib/email';

// Minimum gap between two sends for the same license. Guards against
// accidental double-sends / mashing the resend button in the dashboard.
const RESEND_COOLDOWN_MS = 60 * 1000;

interface PartnerBranding {
  id: string;
  name: string;
  program_name?: string | null;
  logo_url?: string | null;
  logo_initial?: string | null;
  primary_color?: string | null;
  support_email?: string | null;
}

const PARTNER_BRANDING_COLUMNS =
  'id, name, program_name, logo_url, logo_initial, primary_color, support_email';

function buildEdcInfo(partner: PartnerBranding | null): EdcEmailInfo | undefined {
  if (!partner) return undefined;
  return {
    programName: partner.program_name || partner.name || 'Moil Partners',
    fullName: partner.name || 'Moil Partners',
    // Don't default to the Moil logo — the template falls back to logoInitial.
    logo: partner.logo_url || undefined,
    logoInitial: partner.logo_initial || partner.name?.charAt(0) || 'M',
    primaryColor: partner.primary_color || '#5843BE',
    supportEmail: partner.support_email || 'support@moilapp.com',
    licenseDuration: '12 months',
  };
}

export async function POST(request: Request) {
  try {
    const { licenseId } = await request.json();

    if (!licenseId) {
      return NextResponse.json(
        { error: 'License ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get current admin user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please login.' },
        { status: 401 }
      );
    }

    // Verify user is an admin and get their own partner branding
    const { data: adminData, error: adminError } = await supabase
      .from('admins')
      .select(`*, partner:partners(${PARTNER_BRANDING_COLUMNS})`)
      .eq('id', user.id)
      .single();

    if (adminError || !adminData) {
      return NextResponse.json(
        { error: 'Access denied. Admin account required.' },
        { status: 403 }
      );
    }

    const isMoilAdmin =
      adminData.global_role === 'moil_admin' ||
      (adminData.email as string | null)?.endsWith('@moilapp.com') === true;

    // Get user's team
    const { data: teamMember } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('admin_id', user.id)
      .single();

    const teamId = teamMember?.team_id;

    let licenseQuery = supabase
      .from('licenses')
      .select('*')
      .eq('id', licenseId);

    if (isMoilAdmin) {
      // Moil admins can resend for any license (RLS grants cross-partner read).
    } else if (teamId) {
      // If user is in a team, they can resend for any team license
      licenseQuery = licenseQuery.eq('team_id', teamId);
    } else {
      // Solo admin can only resend for their own licenses
      licenseQuery = licenseQuery.eq('admin_id', user.id);
    }

    const { data: license, error: licenseError } = await licenseQuery.single();

    if (licenseError || !license) {
      return NextResponse.json(
        { error: 'License not found or you do not have permission to resend' },
        { status: 404 }
      );
    }

    if (license.is_activated) {
      return NextResponse.json(
        { error: 'License is already activated' },
        { status: 400 }
      );
    }

    // Cooldown — don't let the same license be emailed twice in quick succession.
    const lastSentAt = license.last_reminder_sent_at || license.activation_email_sent_at;
    if (lastSentAt) {
      const elapsed = Date.now() - new Date(lastSentAt).getTime();
      if (elapsed < RESEND_COOLDOWN_MS) {
        const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
        return NextResponse.json(
          { error: `An email was just sent to this address. Try again in ${waitSeconds}s.` },
          { status: 429 }
        );
      }
    }

    // Branding: prefer the partner the license belongs to (a Moil admin may be
    // resending on behalf of another workspace), then the license owner's
    // partner, and finally the acting admin's own partner.
    let partnerInfo = (adminData.partner as PartnerBranding | null) || null;

    if (license.partner_id && license.partner_id !== partnerInfo?.id) {
      const { data: licensePartner } = await supabase
        .from('partners')
        .select(PARTNER_BRANDING_COLUMNS)
        .eq('id', license.partner_id)
        .single();
      if (licensePartner) partnerInfo = licensePartner as PartnerBranding;
    } else if (!license.partner_id && license.admin_id && license.admin_id !== user.id) {
      const { data: ownerAdmin } = await supabase
        .from('admins')
        .select(`partner:partners(${PARTNER_BRANDING_COLUMNS})`)
        .eq('id', license.admin_id)
        .single();
      const ownerPartner = ownerAdmin?.partner as PartnerBranding | null | undefined;
      if (ownerPartner) partnerInfo = ownerPartner;
    }

    const partnerName = partnerInfo?.name || 'moil-partners';
    // Create URL-safe org name (replace spaces with hyphens)
    // Partner names are already lowercase and contain only alphanumeric chars and spaces
    const orgSlug = partnerName.replace(/\s+/g, '-');

    const edcInfo = buildEdcInfo(partnerInfo);

    // Resend activation email with license ID for activation
    const activationUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://business.moilapp.com'}/register?licenseId=${license.id}&ref=moilPartners&org=${orgSlug}`;

    const emailResult = await sendLicenseActivationEmail({
      email: license.email,
      activationUrl,
      adminName: `${adminData.first_name} ${adminData.last_name}`,
      edc: edcInfo,
    });

    const sentAt = new Date().toISOString();

    // Update message_id and email_status based on result
    if (emailResult.success && emailResult.messageId) {
      await supabase
        .from('licenses')
        .update({
          message_id: emailResult.messageId,
          email_status: 'sent',
          activation_email_sent_at: sentAt,
          last_reminder_sent_at: null,
          reminder_count: 0,
        })
        .eq('id', license.id);
    } else {
      console.error('Failed to resend activation email:', emailResult.error);
      await supabase
        .from('licenses')
        .update({
          email_status: 'failed'
        })
        .eq('id', license.id);
      return NextResponse.json(
        { error: 'Failed to send email' },
        { status: 500 }
      );
    }

    // Log activity
    if (teamMember?.team_id) {
      await supabase.rpc('log_activity', {
        p_team_id: teamMember.team_id,
        p_admin_id: user.id,
        p_activity_type: 'license_resend',
        p_description: `Resent activation email to ${license.email}`,
        p_metadata: { license_id: license.id, email: license.email }
      });
    }

    return NextResponse.json(
      {
        message: 'Activation email resent successfully',
        email: license.email,
        sentAt,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Resend email error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
