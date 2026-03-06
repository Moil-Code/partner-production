import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();

    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is an admin
    const { data: admin, error: adminError } = await supabase
      .from('admins')
      .select('id, email, purchased_license_count')
      .eq('id', user.id)
      .single();

    if (adminError || !admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

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

    // Get license stats from licenses table for the team (or admin if no team)
    let licensesQuery = supabase
      .from('licenses')
      .select('id, is_activated');
    
    if (teamId) {
      // If user is in a team, get all team licenses
      licensesQuery = licensesQuery.eq('team_id', teamId);
    } else {
      // Fallback to admin-level licenses
      licensesQuery = licensesQuery.eq('admin_id', user.id);
    }

    const { data: licenses, error: licensesError } = await licensesQuery;

    if (licensesError) {
      console.error('License stats fetch error:', licensesError);
      return NextResponse.json({ error: 'Failed to fetch license stats' }, { status: 500 });
    }

    const assignedLicenses = licenses?.length || 0;
    const activated = licenses?.filter(l => l.is_activated).length || 0;
    const pending = assignedLicenses - activated;
    
    // Get purchased license count from team or admin
    let purchasedLicenseCount = 0;
    if (team?.purchased_license_count) {
      purchasedLicenseCount = team.purchased_license_count;
    } else {
      // Solo admin - get from admin record
      purchasedLicenseCount = admin.purchased_license_count || 0;
    }
    
    const availableLicenses = purchasedLicenseCount - assignedLicenses;

    return NextResponse.json({
      // New field names
      purchased: purchasedLicenseCount,
      assigned: assignedLicenses,
      activated,
      pending,
      available: availableLicenses,
      // Legacy field names for backward compatibility
      total: assignedLicenses,
      purchased_license_count: purchasedLicenseCount,
      active_purchased_license_count: activated,
      available_licenses: availableLicenses,
    }, { status: 200 });

  } catch (error) {
    console.error('License stats error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
