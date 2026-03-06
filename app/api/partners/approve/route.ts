import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { sendPartnerApprovedEmail } from '@/lib/email';
import { getBaseUrl } from '@/lib/config';

// GET /api/partners/approve?partnerId=xxx - Approve a partner (from email link)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const partnerId = searchParams.get('partnerId');

    if (!partnerId) {
      return NextResponse.redirect(new URL('/moil-admin/dashboard?error=missing_partner_id', request.url));
    }

    const supabaseAdmin = createAdminClient();

    // Check if partner exists and is pending
    const { data: partner, error: fetchError } = await supabaseAdmin
      .from('partners')
      .select('id, name, domain, status')
      .eq('id', partnerId)
      .single();

    if (fetchError || !partner) {
      return NextResponse.redirect(new URL('/moil-admin/dashboard?error=partner_not_found', request.url));
    }

    if (partner.status === 'active') {
      // Already approved, redirect to dashboard with success message
      return NextResponse.redirect(new URL(`/moil-admin/dashboard?message=already_approved&partner=${encodeURIComponent(partner.name)}`, request.url));
    }

    if (partner.status === 'suspended') {
      return NextResponse.redirect(new URL('/moil-admin/dashboard?error=partner_suspended', request.url));
    }

    // Update partner status to active
    const { error: updateError } = await supabaseAdmin
      .from('partners')
      .update({ status: 'active' })
      .eq('id', partnerId);

    if (updateError) {
      console.error('Error approving partner:', updateError);
      return NextResponse.redirect(new URL('/moil-admin/dashboard?error=approval_failed', request.url));
    }

    // Get all admins with matching email domain to send them approval emails
    const { data: admins, error: fetchAdminsError } = await supabaseAdmin
      .from('admins')
      .select('id, email')
      .ilike('email', `%@${partner.domain}`);

    if (fetchAdminsError) {
      console.error('Error fetching admins:', fetchAdminsError);
    }

    // Update all admins with matching email domain to link them to this partner
    const { error: adminError } = await supabaseAdmin
      .from('admins')
      .update({ 
        partner_id: partnerId,
        global_role: 'partner_admin'
      })
      .ilike('email', `%@${partner.domain}`);

    if (adminError) {
      console.error('Error updating admins:', adminError);
      // Don't fail - partner is already approved
    }

    // Send approval email to all partner admins
    if (admins && admins.length > 0) {
      for (const admin of admins) {
        try {
          await sendPartnerApprovedEmail({
            organizationName: partner.name,
            adminEmail: admin.email,
          });
          console.log(`Approval email sent to ${admin.email}`);
        } catch (emailError) {
          console.error(`Failed to send approval email to ${admin.email}:`, emailError);
          // Don't fail - partner is already approved, email is just a notification
        }
      }
    }

    // Log activity
    await supabaseAdmin.from('activity_logs').insert({
      team_id: null,
      admin_id: null,
      partner_id: partnerId,
      activity_type: 'partner_approved',
      description: `Partner approved via email link: ${partner.name} (${partner.domain})`,
      metadata: { 
        partner_id: partnerId, 
        partner_name: partner.name, 
        domain: partner.domain,
        approved_via: 'email_link',
      },
    });

    // Redirect to dashboard with success message
    const baseUrl = getBaseUrl();
    return NextResponse.redirect(new URL(`/moil-admin/dashboard?message=partner_approved&partner=${encodeURIComponent(partner.name)}`, baseUrl));

  } catch (error) {
    console.error('Partner approval error:', error);
    return NextResponse.redirect(new URL('/moil-admin/dashboard?error=internal_error', request.url));
  }
}
