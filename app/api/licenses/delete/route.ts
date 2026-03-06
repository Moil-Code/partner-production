import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please login.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { licenseId } = body;

    if (!licenseId) {
      return NextResponse.json(
        { error: 'License ID is required' },
        { status: 400 }
      );
    }

    // Get admin info and team membership
    const { data: adminData, error: adminError } = await supabase
      .from('admins')
      .select('id, global_role, partner_id')
      .eq('id', user.id)
      .single();

    if (adminError || !adminData) {
      return NextResponse.json(
        { error: 'Admin not found' },
        { status: 404 }
      );
    }

    // Get team membership
    const { data: teamMember } = await supabase
      .from('team_members')
      .select('team_id, role')
      .eq('admin_id', user.id)
      .single();

    const teamId = teamMember?.team_id;

    // Get the license to verify ownership
    let licenseQuery = supabase
      .from('licenses')
      .select('*')
      .eq('id', licenseId);

    // If user is in a team, check team ownership
    // If solo admin, check admin ownership
    if (teamId) {
      licenseQuery = licenseQuery.eq('team_id', teamId);
    } else {
      licenseQuery = licenseQuery.eq('admin_id', user.id);
    }

    const { data: license, error: licenseError } = await licenseQuery.single();

    if (licenseError || !license) {
      return NextResponse.json(
        { error: 'License not found or you do not have permission to delete it' },
        { status: 404 }
      );
    }

    // Only allow deletion of non-activated licenses
    if (license.is_activated) {
      return NextResponse.json(
        { error: 'Cannot delete an activated license. Only pending licenses can be deleted.' },
        { status: 400 }
      );
    }

    // Delete the license
    const { error: deleteError } = await supabase
      .from('licenses')
      .delete()
      .eq('id', licenseId);

    if (deleteError) {
      console.error('Error deleting license:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete license' },
        { status: 500 }
      );
    }

    // Log activity
    if (teamId) {
      await supabase.rpc('log_activity', {
        p_team_id: teamId,
        p_admin_id: user.id,
        p_activity_type: 'license_deleted',
        p_description: `Deleted license for ${license.email}`,
        p_metadata: { license_id: licenseId, email: license.email }
      });
    }

    return NextResponse.json({
      success: true,
      message: 'License deleted successfully',
    });

  } catch (error) {
    console.error('Delete license error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
