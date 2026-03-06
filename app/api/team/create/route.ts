import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST - Create a new team for an admin who doesn't have one
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name } = await request.json();

    // Get admin info including purchased_license_count and partner_id
    const { data: adminData, error: adminError } = await supabase
      .from('admins')
      .select('email, first_name, last_name, purchased_license_count, partner_id')
      .eq('id', user.id)
      .single();

    if (adminError || !adminData) {
      return NextResponse.json({ error: 'Admin profile not found' }, { status: 404 });
    }

    // Check if already in a team
    const { data: existingMembership } = await supabase
      .from('team_members')
      .select('id, team_id')
      .eq('admin_id', user.id)
      .single();

    if (existingMembership) {
      return NextResponse.json({
        error: 'You are already a member of a team'
      }, { status: 400 });
    }

    // Extract domain from email
    const domain = adminData.email.split('@')[1];

    // Generate team name if not provided
    let teamName = name;
    if (!teamName) {
      // Simple heuristic for default name
      const orgName = domain === 'moilapp.com' ? 'Moil' :
        domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);

      teamName = `${adminData.first_name}'s ${orgName} Team`;
    }

    // Create team with partner_id
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .insert({
        name: teamName,
        domain: domain,
        owner_id: user.id,
        partner_id: adminData.partner_id,
      })
      .select()
      .single();

    if (teamError) {
      console.error('Create team error:', teamError);
      return NextResponse.json({ error: 'Failed to create team' }, { status: 500 });
    }

    // Add user as team owner
    const { error: memberError } = await supabase
      .from('team_members')
      .insert({
        team_id: team.id,
        admin_id: user.id,
        role: 'owner',
      });

    if (memberError) {
      console.error('Add owner error:', memberError);
      // Rollback team creation
      await supabase.from('teams').delete().eq('id', team.id);
      return NextResponse.json({ error: 'Failed to set up team' }, { status: 500 });
    }

    // Transfer admin's purchased_license_count to team
    const adminPurchasedCount = adminData.purchased_license_count || 0;

    if (adminPurchasedCount > 0) {
      await supabase
        .from('teams')
        .update({ purchased_license_count: adminPurchasedCount })
        .eq('id', team.id);
    }

    // Migrate all existing solo admin licenses to the team
    await supabase
      .from('licenses')
      .update({ team_id: team.id, performed_by: user.id })
      .eq('admin_id', user.id)
      .is('team_id', null);

    // Reset admin's purchased_license_count to 0 since licenses are now managed by team
    await supabase
      .from('admins')
      .update({ purchased_license_count: 0 })
      .eq('id', user.id);

    // Log activity
    await supabase.rpc('log_activity', {
      p_team_id: team.id,
      p_admin_id: user.id,
      p_activity_type: 'team_settings_updated',
      p_description: `Created team "${teamName}"`,
      p_metadata: { action: 'team_created' }
    });

    return NextResponse.json({
      success: true,
      team: {
        id: team.id,
        name: team.name,
        domain: team.domain,
      }
    }, { status: 201 });
  } catch (error) {
    console.error('Create team error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
