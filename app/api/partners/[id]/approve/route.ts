import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { sendPartnerApprovedEmail } from '@/lib/email';

// POST /api/partners/[id]/approve - Approve a partner (from dashboard)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: partnerId } = await params;
    const supabase = await createClient();

    // Check if user is Moil admin
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: admin } = await supabase
      .from('admins')
      .select('global_role')
      .eq('id', user.id)
      .single();

    if (admin?.global_role !== 'moil_admin') {
      return NextResponse.json({ error: 'Forbidden: Moil admin access required' }, { status: 403 });
    }

    const supabaseAdmin = createAdminClient();

    // Check if partner exists and is pending
    const { data: partner, error: fetchError } = await supabaseAdmin
      .from('partners')
      .select('id, name, domain, status')
      .eq('id', partnerId)
      .single();

    if (fetchError || !partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    if (partner.status === 'active') {
      return NextResponse.json({ 
        message: 'Partner is already approved',
        partner 
      });
    }

    if (partner.status === 'suspended') {
      return NextResponse.json({ error: 'Cannot approve a suspended partner' }, { status: 400 });
    }

    // Update partner status to active
    const { error: updateError } = await supabaseAdmin
      .from('partners')
      .update({ status: 'active' })
      .eq('id', partnerId);

    if (updateError) {
      console.error('Error approving partner:', updateError);
      return NextResponse.json({ error: 'Failed to approve partner' }, { status: 500 });
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
      admin_id: user.id,
      partner_id: partnerId,
      activity_type: 'partner_approved',
      description: `Partner approved from dashboard: ${partner.name} (${partner.domain})`,
      metadata: { 
        partner_id: partnerId, 
        partner_name: partner.name, 
        domain: partner.domain,
        approved_via: 'dashboard',
        approved_by: user.id,
      },
    });

    return NextResponse.json({ 
      success: true,
      message: `Partner ${partner.name} has been approved`,
      partner: {
        id: partner.id,
        name: partner.name,
        domain: partner.domain,
        status: 'active',
      }
    });

  } catch (error) {
    console.error('Partner approval error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
