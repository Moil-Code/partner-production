import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { sendPartnerAccessRequestEmail } from '@/lib/email';
import { getBaseUrl } from '@/lib/config';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { organizationName, email, userId } = body;

    // Validate required fields
    if (!organizationName || !email) {
      return NextResponse.json(
        { error: 'Organization name and email are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Extract domain from email
    const domain = email.split('@')[1].toLowerCase();

    // Validate organization name length
    if (organizationName.trim().length < 2 || organizationName.trim().length > 100) {
      return NextResponse.json(
        { error: 'Organization name must be between 2 and 100 characters' },
        { status: 400 }
      );
    }

    // Use admin client to bypass RLS for partner creation
    const supabaseAdmin = createAdminClient();
    const supabase = await createClient();

    // Check if partner with this domain already exists
    const { data: existingPartner } = await supabaseAdmin
      .from('partners')
      .select('id, name, status')
      .eq('domain', domain)
      .single();

    if (existingPartner) {
      if (existingPartner.status === 'active') {
        // Partner already exists and is active - user needs to be invited by existing admin
        return NextResponse.json(
          { 
            error: 'This domain is already registered to an existing partner. Please contact your organization administrator to receive an invitation.',
            code: 'DOMAIN_ALREADY_REGISTERED'
          },
          { status: 409 }
        );
      } else if (existingPartner.status === 'pending') {
        // Partner exists but is pending approval
        return NextResponse.json(
          { 
            error: 'This domain has a pending partner request. Please wait for approval or contact your organization administrator.',
            code: 'DOMAIN_PENDING_APPROVAL'
          },
          { status: 409 }
        );
      } else if (existingPartner.status === 'suspended') {
        return NextResponse.json(
          { error: 'This domain has been suspended. Please contact support.' },
          { status: 409 }
        );
      }
    }

    // Create the partner with 'pending' status - requires Moil admin approval
    // Use admin client to bypass RLS
    const { data: newPartner, error: partnerError } = await supabaseAdmin
      .from('partners')
      .insert({
        name: organizationName.trim().toLowerCase(),
        domain: domain,
        status: 'pending',
        program_name: organizationName.trim(),
        full_name: organizationName.trim(),
        logo_initial: organizationName.trim().charAt(0).toUpperCase(),
      })
      .select()
      .single();

    if (partnerError) {
      console.error('Error creating partner:', partnerError);
      return NextResponse.json(
        { error: 'Failed to create partner' },
        { status: 500 }
      );
    }

    // Link the admin to the newly created partner using admin client
    if (userId) {
      const { error: adminError } = await supabaseAdmin
        .from('admins')
        .update({ 
          partner_id: newPartner.id,
          global_role: 'partner_admin'
        })
        .eq('id', userId);

      if (adminError) {
        console.error('Error linking admin to partner:', adminError);
        // Don't fail - partner is created, admin can be linked later
      }
    }

    // Send notification email to Moil admins for approval
    const baseUrl = getBaseUrl();
    const approvalUrl = `${baseUrl}/api/partners/approve?partnerId=${newPartner.id}`;
    
    try {
      await sendPartnerAccessRequestEmail({
        organizationName: newPartner.name,
        domain: newPartner.domain,
        requesterEmail: email,
        requestedAt: new Date().toISOString(),
        approvalUrl: approvalUrl,
      });
      console.log('Partner access request email sent to Moil admins');
    } catch (emailError) {
      console.error('Failed to send partner access request email:', emailError);
      // Don't fail the request - partner is created, email is just a notification
    }

    return NextResponse.json({
      success: true,
      message: 'Partner access request submitted. Your account is pending approval by Moil administrators.',
      partner: {
        id: newPartner.id,
        name: newPartner.name,
        domain: newPartner.domain,
        status: newPartner.status,
      },
      userId: userId || null,
    });

  } catch (error) {
    console.error('Error in partner creation:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
