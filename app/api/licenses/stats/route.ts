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
      .select('id, is_activated, grant_kind');
    
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

    // Add-ons (grant_kind = 'addon') are time-boxed tier upgrades on top of a
    // licensee's existing license — the same person, not a new one. They must
    // never enter the seat maths: a partner reading "12 licenses" needs that to
    // be 12 PEOPLE, and `available` is what gates issuing the next license.
    // Rows written before the add-on migration have no grant_kind, so the test
    // is "not an addon" rather than "is base".
    const baseLicenses = (licenses || []).filter(l => l.grant_kind !== 'addon');
    const addonLicenses = (licenses || []).filter(l => l.grant_kind === 'addon');

    const assignedLicenses = baseLicenses.length;
    const activated = baseLicenses.filter(l => l.is_activated).length;
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
      // Reported separately so the dashboard can show them without either
      // number lying about the other.
      addons: addonLicenses.length,
      addons_active: addonLicenses.filter(l => l.is_activated).length,
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
