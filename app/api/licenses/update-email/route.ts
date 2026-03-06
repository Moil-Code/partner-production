import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();

    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is an admin
    const { data: adminData, error: adminError } = await supabase
      .from('admins')
      .select('*')
      .eq('id', user.id)
      .single();

    if (adminError || !adminData) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { licenseId, newEmail } = await request.json();

    if (!licenseId || !newEmail) {
      return NextResponse.json({ error: 'License ID and new email are required' }, { status: 400 });
    }

    // Validate email format
    if (!newEmail.includes('@')) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Get user's team
    const { data: teamMember } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('admin_id', user.id)
      .single();

    const teamId = teamMember?.team_id;

    // Get the license to verify ownership
    let licenseQuery = supabase
      .from('licenses')
      .select('*')
      .eq('id', licenseId);

    if (teamId) {
      licenseQuery = licenseQuery.eq('team_id', teamId);
    } else {
      licenseQuery = licenseQuery.eq('admin_id', user.id);
    }

    const { data: license, error: licenseError } = await licenseQuery.single();

    if (licenseError || !license) {
      return NextResponse.json(
        { error: 'License not found or you do not have permission to edit it' },
        { status: 404 }
      );
    }

    // Check if license is already activated
    if (license.is_activated) {
      return NextResponse.json(
        { error: 'Cannot edit email for activated licenses' },
        { status: 400 }
      );
    }

    // Check if new email already exists for this team/admin
    let existingQuery = supabase
      .from('licenses')
      .select('id')
      .eq('email', newEmail.toLowerCase())
      .neq('id', licenseId);

    if (teamId) {
      existingQuery = existingQuery.eq('team_id', teamId);
    } else {
      existingQuery = existingQuery.eq('admin_id', user.id);
    }

    const { data: existing } = await existingQuery.single();

    if (existing) {
      return NextResponse.json(
        { error: 'A license with this email already exists' },
        { status: 400 }
      );
    }

    // Update the license email
    const { error: updateError } = await supabase
      .from('licenses')
      .update({ email: newEmail.toLowerCase() })
      .eq('id', licenseId);

    if (updateError) {
      console.error('License email update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update license email' },
        { status: 500 }
      );
    }

    // Log activity
    if (teamMember?.team_id) {
      await supabase.rpc('log_activity', {
        p_team_id: teamMember.team_id,
        p_admin_id: user.id,
        p_activity_type: 'license_email_updated',
        p_description: `Updated license email from ${license.email} to ${newEmail.toLowerCase()}`,
        p_metadata: { license_id: licenseId, old_email: license.email, new_email: newEmail.toLowerCase() }
      });
    }

    return NextResponse.json(
      { message: 'License email updated successfully' },
      { status: 200 }
    );

  } catch (error) {
    console.error('Update license email error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
