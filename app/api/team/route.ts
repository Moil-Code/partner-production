import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET - Get current user's team info
export async function GET() {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's team membership
    const { data: teamMember, error: teamError } = await supabase
      .from('team_members')
      .select(`
        team_id,
        role,
        team:teams (
          id,
          name,
          domain,
          owner_id,
          purchased_license_count,
          created_at
        )
      `)
      .eq('admin_id', user.id)
      .single();

    if (teamError || !teamMember) {
      // Admin exists but is not in a team - this is valid
      console.log('No team found for user:', user.id, teamError);
      return NextResponse.json({ 
        team: null,
        userRole: null,
        isOwner: false,
        members: [],
        pendingInvitations: [],
        hasTeam: false,
      });
    }

    const teamId = teamMember.team_id;
    console.log('Fetching members for team:', teamId);

    // Get ALL team members for this team
    const { data: members, error: membersError, count } = await supabase
      .from('team_members')
      .select(`
        id,
        team_id,
        role,
        joined_at,
        admin:admins!team_members_admin_id_fkey (
          id,
          email,
          first_name,
          last_name
        )
      `, { count: 'exact' })
      .eq('team_id', teamId)
      .order('joined_at', { ascending: true });

    if (membersError) {
      console.error('Error fetching members for team', teamId, ':', membersError);
      console.error('Full error details:', JSON.stringify(membersError, null, 2));
    } else {
      console.log('Found', members?.length || 0, 'members for team', teamId, 'count:', count);
      console.log('Members data:', JSON.stringify(members, null, 2));
    }

    // Get pending invitations
    const { data: invitations, error: invitationsError } = await supabase
      .from('team_invitations')
      .select('*')
      .eq('team_id', teamId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (invitationsError) {
      console.error('Error fetching invitations:', invitationsError);
    }

    // Filter out invitations where the user has already joined (their email is in team_members)
    const memberEmails = new Set((members || []).map((m: any) => m.admin?.email?.toLowerCase()));
    const filteredInvitations = (invitations || []).filter(
      (inv: any) => !memberEmails.has(inv.email?.toLowerCase())
    );

    return NextResponse.json({
      team: teamMember.team,
      userRole: teamMember.role,
      isOwner: (teamMember.team as any).owner_id === user.id,
      members: members || [],
      pendingInvitations: filteredInvitations,
      hasTeam: true,
      debug: {
        teamId,
        membersCount: members?.length || 0,
        membersError: membersError ? membersError.message : null,
      }
    });
  } catch (error) {
    console.error('Get team error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH - Update team settings
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name } = await request.json();

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Team name is required' }, { status: 400 });
    }

    // Get user's team where they are owner
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (teamError || !team) {
      return NextResponse.json({ error: 'Only team owners can update team settings' }, { status: 403 });
    }

    // Update team name
    const { data: updatedTeam, error: updateError } = await supabase
      .from('teams')
      .update({ name: name.trim() })
      .eq('id', team.id)
      .select()
      .single();

    if (updateError) {
      console.error('Update team error:', updateError);
      return NextResponse.json({ error: 'Failed to update team' }, { status: 500 });
    }

    // Log activity
    await supabase.rpc('log_activity', {
      p_team_id: team.id,
      p_admin_id: user.id,
      p_activity_type: 'team_settings_updated',
      p_description: `Team name updated to "${name.trim()}"`,
      p_metadata: { new_name: name.trim() }
    });

    return NextResponse.json({ team: updatedTeam });
  } catch (error) {
    console.error('Update team error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
