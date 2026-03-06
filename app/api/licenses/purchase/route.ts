import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * GET endpoint to handle payment gateway redirect
 * Called after successful payment from Stripe
 * Query params: licenseCount, payment, paymentType
 * Redirects to dashboard after processing
 * 
 * License counts are stored at the TEAM level, not admin level
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const licenseCount = searchParams.get('licenseCount');
    const payment = searchParams.get('payment');
    const paymentType = searchParams.get('paymentType');

    console.log('Payment redirect received:', { licenseCount, payment, paymentType });

    // Validate payment was successful
    if (payment !== 'successful' || paymentType !== 'license_purchase') {
      console.log('Payment validation failed');
      return NextResponse.redirect(new URL('/admin/dashboard?error=payment_failed', request.url));
    }

    const licenseCountNum = parseInt(licenseCount || '0', 10);
    if (isNaN(licenseCountNum) || licenseCountNum < 1) {
      console.log('Invalid license count:', licenseCount);
      return NextResponse.redirect(new URL('/admin/dashboard?error=invalid_license_count', request.url));
    }

    // Get current authenticated user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.log('User not authenticated:', authError);
      return NextResponse.redirect(new URL('/login?error=unauthorized&redirect=/admin/dashboard', request.url));
    }

    console.log('Processing payment for user:', user.id);

    // Use service role key to update license count
    const supabaseAdmin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Ensure admin record exists
    let { data: admin, error: adminError } = await supabaseAdmin
      .from('admins')
      .select('id')
      .eq('id', user.id)
      .single();

    if (adminError || !admin) {
      console.log('Admin not found, creating record:', adminError);
      
      const firstName = user.user_metadata?.first_name || '';
      const lastName = user.user_metadata?.last_name || '';
      
      if (!user.email) {
        console.log('User email not found');
        return NextResponse.redirect(new URL('/admin/dashboard?error=admin_not_found', request.url));
      }
      
      const { data: newAdmin, error: createError } = await supabaseAdmin
        .from('admins')
        .insert({
          id: user.id,
          email: user.email,
          first_name: firstName,
          last_name: lastName,
        })
        .select('id')
        .single();
      
      if (createError || !newAdmin) {
        console.error('Failed to create admin record:', createError);
        return NextResponse.redirect(new URL('/admin/dashboard?error=admin_creation_failed', request.url));
      }
      
      admin = newAdmin;
      console.log('Admin record created successfully');
    }

    // Get user's team membership
    const { data: teamMember } = await supabaseAdmin
      .from('team_members')
      .select('team_id')
      .eq('admin_id', user.id)
      .single();

    const teamId = teamMember?.team_id;
    let newLicenseCount: number;

    if (teamId) {
      // User is in a team - update team's purchased license count
      const { data: team, error: teamError } = await supabaseAdmin
        .from('teams')
        .select('id, purchased_license_count')
        .eq('id', teamId)
        .single();

      if (teamError || !team) {
        console.error('Team not found:', teamError);
        return NextResponse.redirect(new URL('/admin/dashboard?error=team_not_found', request.url));
      }

      console.log('Current team license count:', team.purchased_license_count);

      newLicenseCount = (team.purchased_license_count || 0) + licenseCountNum;
      
      const { error: updateError } = await supabaseAdmin
        .from('teams')
        .update({ purchased_license_count: newLicenseCount })
        .eq('id', team.id);

      if (updateError) {
        console.error('Failed to update team license count:', updateError);
        return NextResponse.redirect(new URL('/admin/dashboard?error=update_failed', request.url));
      }

      console.log('Team license count updated successfully:', newLicenseCount);

      // Log activity for team
      await supabaseAdmin.rpc('log_activity', {
        p_team_id: team.id,
        p_admin_id: user.id,
        p_activity_type: 'licenses_purchased',
        p_description: `Purchased ${licenseCountNum} license(s)`,
        p_metadata: { licenses_added: licenseCountNum, total_licenses: newLicenseCount }
      });
    } else {
      // User is a solo admin - update admin's purchased license count
      console.log('User is a solo admin, updating admin license count');

      const { data: adminData, error: adminFetchError } = await supabaseAdmin
        .from('admins')
        .select('purchased_license_count')
        .eq('id', user.id)
        .single();

      if (adminFetchError || !adminData) {
        console.error('Failed to fetch admin data:', adminFetchError);
        return NextResponse.redirect(new URL('/admin/dashboard?error=admin_fetch_failed', request.url));
      }

      console.log('Current admin license count:', adminData.purchased_license_count);

      newLicenseCount = (adminData.purchased_license_count || 0) + licenseCountNum;
      
      const { error: updateError } = await supabaseAdmin
        .from('admins')
        .update({ purchased_license_count: newLicenseCount })
        .eq('id', user.id);

      if (updateError) {
        console.error('Failed to update admin license count:', updateError);
        return NextResponse.redirect(new URL('/admin/dashboard?error=update_failed', request.url));
      }

      console.log('Admin license count updated successfully:', newLicenseCount);
    }

    // Redirect to dashboard with success message
    return NextResponse.redirect(new URL(`/admin/dashboard?success=purchase_complete&licenses_added=${licenseCountNum}&total_licenses=${newLicenseCount}`, request.url));

  } catch (error) {
    console.error('Payment processing error:', error);
    return NextResponse.redirect(new URL('/admin/dashboard?error=unexpected_error', request.url));
  }
}

/**
 * POST endpoint to update purchased license count for a team
 * Called by external application (e.g., payment webhook)
 * 
 * Accepts either teamId directly or adminId (will find the admin's team)
 */
export async function POST(request: Request) {
  try {
    const { adminId, teamId, licenseCount } = await request.json();

    // Validate required parameters
    if ((!adminId && !teamId) || !licenseCount) {
      return NextResponse.json(
        { error: 'Missing required parameters: (adminId or teamId) and licenseCount' },
        { status: 400 }
      );
    }

    const licenseCountNum = parseInt(licenseCount, 10);
    if (isNaN(licenseCountNum) || licenseCountNum < 1) {
      return NextResponse.json(
        { error: 'Invalid license count' },
        { status: 400 }
      );
    }

    // Use service role key to bypass RLS for external application
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    let targetTeamId = teamId;

    // If adminId provided, find their team
    if (adminId && !teamId) {
      const { data: teamMember, error: teamMemberError } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('admin_id', adminId)
        .single();

      if (teamMemberError || !teamMember) {
        return NextResponse.json(
          { error: 'Admin is not in a team' },
          { status: 404 }
        );
      }
      targetTeamId = teamMember.team_id;
    }

    // Get current team data
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('id, purchased_license_count')
      .eq('id', targetTeamId)
      .single();

    if (teamError || !team) {
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404 }
      );
    }

    // Update the team's purchased license count
    const newLicenseCount = (team.purchased_license_count || 0) + licenseCountNum;
    
    const { data: updatedTeam, error: updateError } = await supabase
      .from('teams')
      .update({ purchased_license_count: newLicenseCount })
      .eq('id', team.id)
      .select()
      .single();

    if (updateError) {
      console.error('Failed to update team license count:', updateError);
      return NextResponse.json(
        { error: 'Failed to update license count' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Team license count updated successfully',
      team_id: team.id,
      licenses_added: licenseCountNum,
      total_licenses: updatedTeam.purchased_license_count,
    }, { status: 200 });

  } catch (error) {
    console.error('Purchase update error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
