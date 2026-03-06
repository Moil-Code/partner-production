import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET - Get team members
export async function GET() {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's team
    const { data: teamMember, error: teamError } = await supabase
      .from('team_members')
      .select('team_id, role')
      .eq('admin_id', user.id)
      .single();

    if (teamError || !teamMember) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Get all team members
    const { data: members, error: membersError } = await supabase
      .from('team_members')
      .select(`
        id,
        role,
        joined_at,
        admin:admins!team_members_admin_id_fkey (
          id,
          email,
          first_name,
          last_name
        )
      `)
      .eq('team_id', teamMember.team_id)
      .order('joined_at', { ascending: true });

    if (membersError) {
      console.error('Fetch members error:', membersError);
      return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
    }

    return NextResponse.json({ 
      members,
      currentUserRole: teamMember.role,
    });
  } catch (error) {
    console.error('Get members error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH - Update member role
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { memberId, role } = await request.json();

    if (!memberId || !role) {
      return NextResponse.json({ error: 'Member ID and role are required' }, { status: 400 });
    }

    if (!['admin', 'member'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Get user's team and verify they are owner
    const { data: teamMember, error: teamError } = await supabase
      .from('team_members')
      .select(`
        team_id,
        role,
        team:teams (
          owner_id
        )
      `)
      .eq('admin_id', user.id)
      .single();

    if (teamError || !teamMember) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Only owners can change roles
    if ((teamMember.team as any).owner_id !== user.id) {
      return NextResponse.json({ 
        error: 'Only team owners can change member roles' 
      }, { status: 403 });
    }

    // Get the target member
    const { data: targetMember, error: targetError } = await supabase
      .from('team_members')
      .select(`
        id,
        admin_id,
        role,
        admin:admins!team_members_admin_id_fkey (
          email
        )
      `)
      .eq('id', memberId)
      .eq('team_id', teamMember.team_id)
      .single();

    if (targetError || !targetMember) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Cannot change owner's role
    if (targetMember.role === 'owner') {
      return NextResponse.json({ error: 'Cannot change owner role' }, { status: 400 });
    }

    // Update role
    const { error: updateError } = await supabase
      .from('team_members')
      .update({ role })
      .eq('id', memberId);

    if (updateError) {
      console.error('Update role error:', updateError);
      return NextResponse.json({ error: 'Failed to update role' }, { status: 500 });
    }

    // Log activity
    await supabase.rpc('log_activity', {
      p_team_id: teamMember.team_id,
      p_admin_id: user.id,
      p_activity_type: 'member_role_changed',
      p_description: `Changed ${(targetMember.admin as any).email}'s role from ${targetMember.role} to ${role}`,
      p_metadata: { 
        member_id: targetMember.admin_id,
        old_role: targetMember.role,
        new_role: role 
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update role error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Remove a member from the team
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { memberId } = await request.json();

    if (!memberId) {
      return NextResponse.json({ error: 'Member ID is required' }, { status: 400 });
    }

    // Get user's team and verify they are owner or admin
    const { data: teamMember, error: teamError } = await supabase
      .from('team_members')
      .select(`
        team_id,
        role,
        team:teams (
          owner_id
        )
      `)
      .eq('admin_id', user.id)
      .single();

    if (teamError || !teamMember) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const isOwner = (teamMember.team as any).owner_id === user.id;

    // Only owners can remove members
    if (!isOwner) {
      return NextResponse.json({ 
        error: 'Only team owners can remove members' 
      }, { status: 403 });
    }

    // Get the target member
    const { data: targetMember, error: targetError } = await supabase
      .from('team_members')
      .select(`
        id,
        admin_id,
        role,
        admin:admins!team_members_admin_id_fkey (
          email
        )
      `)
      .eq('id', memberId)
      .eq('team_id', teamMember.team_id)
      .single();

    if (targetError || !targetMember) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Cannot remove owner
    if (targetMember.role === 'owner') {
      return NextResponse.json({ error: 'Cannot remove team owner' }, { status: 400 });
    }

    // Remove member
    const { error: deleteError } = await supabase
      .from('team_members')
      .delete()
      .eq('id', memberId);

    if (deleteError) {
      console.error('Remove member error:', deleteError);
      return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
    }

    // Log activity
    await supabase.rpc('log_activity', {
      p_team_id: teamMember.team_id,
      p_admin_id: user.id,
      p_activity_type: 'member_removed',
      p_description: `Removed ${(targetMember.admin as any).email} from the team`,
      p_metadata: { 
        removed_member_id: targetMember.admin_id,
        removed_member_email: (targetMember.admin as any).email 
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Remove member error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
