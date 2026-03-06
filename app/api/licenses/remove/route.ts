import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(request: Request) {
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

    // Verify user is an admin
    const { data: adminData, error: adminError } = await supabase
      .from('admins')
      .select('*')
      .eq('id', user.id)
      .single();

    if (adminError || !adminData) {
      return NextResponse.json(
        { error: 'Access denied. Admin account required.' },
        { status: 403 }
      );
    }

    // Get user's team
    const { data: teamMember } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('admin_id', user.id)
      .single();

    const teamId = teamMember?.team_id;

    // Get license info before deletion for logging and verification
    const { data: licenseData } = await supabase
      .from('licenses')
      .select('email, team_id, admin_id')
      .eq('id', licenseId)
      .single();

    if (!licenseData) {
      return NextResponse.json(
        { error: 'License not found' },
        { status: 404 }
      );
    }

    // Verify user has permission to delete this license
    // Team members can delete any license in their team
    // Solo admins can only delete their own licenses
    const canDelete = teamId 
      ? licenseData.team_id === teamId 
      : licenseData.admin_id === user.id;

    if (!canDelete) {
      return NextResponse.json(
        { error: 'You do not have permission to delete this license' },
        { status: 403 }
      );
    }

    // Delete the license
    const { error: deleteError } = await supabase
      .from('licenses')
      .delete()
      .eq('id', licenseId);

    if (deleteError) {
      console.error('License deletion error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete license' },
        { status: 500 }
      );
    }

    // Log activity
    if (teamMember?.team_id && licenseData) {
      await supabase.rpc('log_activity', {
        p_team_id: teamMember.team_id,
        p_admin_id: user.id,
        p_activity_type: 'license_removed',
        p_description: `Removed license for ${licenseData.email}`,
        p_metadata: { license_id: licenseId, email: licenseData.email }
      });
    }

    return NextResponse.json(
      { message: 'License removed successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Remove license error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
