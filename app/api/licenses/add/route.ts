import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { sendLicenseActivationEmail } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    // Validate email
    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Valid email address is required' },
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

    // Verify user is an admin and get team info with full partner branding
    const { data: adminData, error: adminError } = await supabase
      .from('admins')
      .select('*, partner:partners(id, name, program_name, logo_url, logo_initial, primary_color, support_email)')
      .eq('id', user.id)
      .single();

    if (adminError || !adminData) {
      return NextResponse.json(
        { error: 'Access denied. Admin account required.' },
        { status: 403 }
      );
    }

    // Get partner info for activation URL and email branding
    const partnerInfo = adminData.partner as { 
      id: string; 
      name: string; 
      program_name?: string;
      logo_url?: string;
      logo_initial?: string;
      primary_color?: string;
      support_email?: string;
    } | null;
    const partnerName = partnerInfo?.name || 'moil-partners';
    // Create URL-safe org name (replace spaces with hyphens)
    // Partner names are already lowercase and contain only alphanumeric chars and spaces
    const orgSlug = partnerName.replace(/\s+/g, '-');
    
    // Build EDC info for email from partner data
    const edcInfo = partnerInfo ? {
      programName: partnerInfo.program_name || partnerInfo.name || 'Moil Partners',
      fullName: partnerInfo.name || 'Moil Partners',
      logo: partnerInfo.logo_url || undefined, // Don't default to Moil logo - let email template use logoInitial fallback
      logoInitial: partnerInfo.logo_initial || partnerInfo.name?.charAt(0) || 'M',
      primaryColor: partnerInfo.primary_color || '#5843BE',
      supportEmail: partnerInfo.support_email || 'support@moilapp.com',
      licenseDuration: '12 months',
    } : undefined;

    // Get user's team membership and team info
    const { data: teamMember } = await supabase
      .from('team_members')
      .select(`
        team_id,
        team:teams (
          id,
          purchased_license_count
        )
      `)
      .eq('admin_id', user.id)
      .single();

    const teamId = teamMember?.team_id;
    const team = teamMember?.team as unknown as { id: string; purchased_license_count: number } | null;

    // Check globally if email already has a license from ANY partner using admin client
    const adminSupabase = createAdminClient();
    
    const { data: globalLicense } = await adminSupabase
      .from('licenses')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (globalLicense) {
      return NextResponse.json(
        { 
          error: `This email already has a license allocated. If this is a mistake, please contact cs@moilapp.com`
        },
        { status: 400 }
      );
    }

    // Check if license already exists for this email (check team-wide if in a team)
    let existingLicenseQuery = supabase
      .from('licenses')
      .select('*')
      .eq('email', email.toLowerCase());
    
    if (teamId) {
      existingLicenseQuery = existingLicenseQuery.eq('team_id', teamId);
    } else {
      existingLicenseQuery = existingLicenseQuery.eq('admin_id', user.id);
    }

    const { data: existingLicense } = await existingLicenseQuery.single();

    if (existingLicense) {
      return NextResponse.json(
        { error: 'A license for this email already exists' },
        { status: 400 }
      );
    }

    // Check if email already has an activated license in external database using batch endpoint
    let skipActivationEmail = false;
    try {
      if (process.env.NEXT_PUBLIC_QC_API_KEY) {
        const externalResponse = await fetch(`${process.env.NEXT_PUBLIC_MOIL_PAYMENT_ACTIVATION}/api/employer/activate_license`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.NEXT_PUBLIC_QC_API_KEY,
          },
          body: JSON.stringify({ emails: [email.toLowerCase()] }),
        });

        if (externalResponse.ok) {
          const externalData = await externalResponse.json();
          // Check if any result shows activated status
          if (externalData.data?.results && externalData.data.results.length > 0) {
            const result = externalData.data.results[0];
            if (result.license_status === 'activated') {
              skipActivationEmail = true;
            }
          }
        }
      }
    } catch (externalError) {
      console.error('Error checking external license status:', externalError);
      // Continue with normal flow if external check fails
    }

    // Check if team has available licenses
    if (teamId && team) {
      // Count assigned licenses for the team
      const { count: assignedCount } = await supabase
        .from('licenses')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId);

      const availableLicenses = (team.purchased_license_count || 0) - (assignedCount || 0);
      
      if (availableLicenses <= 0) {
        return NextResponse.json(
          { error: 'No available licenses. Please purchase more licenses.' },
          { status: 400 }
        );
      }
    }

    // Create new license (business info will be added during activation)
    const { data: license, error: licenseError } = await supabase
      .from('licenses')
      .insert({
        admin_id: user.id,
        email: email.toLowerCase(),
        business_name: '', // Will be filled during activation
        business_type: '', // Will be filled during activation
        is_activated: false,
        team_id: teamId || null,
        performed_by: user.id,
      })
      .select()
      .single();

    if (licenseError) {
      console.error('License creation error:', licenseError);
      return NextResponse.json(
        { error: 'Failed to create license' },
        { status: 500 }
      );
    }

    // Send activation email with dynamic partner org name (skip if already activated in external system)
    const activationUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://business.moilapp.com'}/register?licenseId=${license.id}&ref=moilPartners&org=${orgSlug}`;
    
    if (skipActivationEmail) {
      // License already activated in external system - mark as activated and skip email
      await supabase
        .from('licenses')
        .update({ 
          is_activated: true,
          email_status: 'skipped',
          activated_at: new Date().toISOString()
        })
        .eq('id', license.id);
    } else {
      const emailResult = await sendLicenseActivationEmail({
        email: license.email,
        activationUrl,
        adminName: `${adminData.first_name} ${adminData.last_name}`,
        edc: edcInfo,
      });

      // Update message_id and email_status based on result
      if (emailResult.success && emailResult.messageId) {
        await supabase
          .from('licenses')
          .update({ 
            message_id: emailResult.messageId,
            email_status: 'sent'
          })
          .eq('id', license.id);
      } else {
        console.error('Failed to send activation email:', emailResult.error);
        await supabase
          .from('licenses')
          .update({ 
            email_status: 'failed'
          })
          .eq('id', license.id);
      }
    }

    // Log activity
    if (teamMember?.team_id) {
      await supabase.rpc('log_activity', {
        p_team_id: teamMember.team_id,
        p_admin_id: user.id,
        p_activity_type: 'license_added',
        p_description: `Added license for ${email.toLowerCase()}`,
        p_metadata: { license_id: license.id, email: email.toLowerCase() }
      });
    }

    return NextResponse.json(
      { 
        message: skipActivationEmail 
          ? 'License added (user already activated in external system)' 
          : 'License added and activation email sent successfully',
        emailSent: !skipActivationEmail,
        alreadyActivated: skipActivationEmail,
        license: {
          id: license.id,
          email: license.email,
          isActivated: license.is_activated || skipActivationEmail,
          createdAt: license.created_at,
        }
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Add license error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
