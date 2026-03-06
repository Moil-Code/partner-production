import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendTeamInvitationEmail } from '@/lib/email';
import { getBaseUrl } from '@/lib/config';

// POST - Invite a member to the team
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { email, role = 'member' } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Validate role
    if (!['admin', 'member'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Get user's team membership
    const { data: teamMember, error: teamError } = await supabase
      .from('team_members')
      .select(`
        role,
        team:teams (
          id,
          name,
          domain
        )
      `)
      .eq('admin_id', user.id)
      .single();

    if (teamError || !teamMember) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Check if user has permission to invite
    if (!['owner', 'admin'].includes(teamMember.role)) {
      return NextResponse.json({ 
        error: 'Only team owners and admins can invite members' 
      }, { status: 403 });
    }

    const team = teamMember.team as any;

    // Check email domain matches team domain
    const emailDomain = normalizedEmail.split('@')[1];
    if (emailDomain !== team.domain) {
      return NextResponse.json({ 
        error: `Only @${team.domain} emails can be invited to this team` 
      }, { status: 400 });
    }

    // Check if user is trying to invite themselves
    const { data: inviterAdmin } = await supabase
      .from('admins')
      .select('email')
      .eq('id', user.id)
      .single();

    if (inviterAdmin?.email === normalizedEmail) {
      return NextResponse.json({ error: 'You cannot invite yourself' }, { status: 400 });
    }

    // Check if already a team member
    const { data: existingMember } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', team.id)
      .eq('admin_id', (
        await supabase
          .from('admins')
          .select('id')
          .eq('email', normalizedEmail)
          .single()
      ).data?.id)
      .single();

    if (existingMember) {
      return NextResponse.json({ error: 'User is already a team member' }, { status: 400 });
    }

    // Check for existing pending invitation
    const { data: existingInvitation } = await supabase
      .from('team_invitations')
      .select('id')
      .eq('team_id', team.id)
      .eq('email', normalizedEmail)
      .eq('status', 'pending')
      .single();

    if (existingInvitation) {
      return NextResponse.json({ error: 'An invitation is already pending for this email' }, { status: 400 });
    }

    // Create invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('team_invitations')
      .insert({
        team_id: team.id,
        email: normalizedEmail,
        invited_by: user.id,
        role: role,
      })
      .select()
      .single();

    if (inviteError) {
      console.error('Create invitation error:', inviteError);
      return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 });
    }

    // Get inviter's name and partner branding info
    const { data: inviterData } = await supabase
      .from('admins')
      .select('first_name, last_name, partner:partners(id, name, program_name, logo_url, logo_initial, primary_color, support_email)')
      .eq('id', user.id)
      .single();

    const inviterName = inviterData 
      ? `${inviterData.first_name} ${inviterData.last_name}` 
      : 'A team member';

    // Build EDC info for email from partner data
    const partnerInfo = inviterData?.partner as unknown as { 
      id: string; 
      name: string; 
      program_name?: string;
      logo_url?: string;
      logo_initial?: string;
      primary_color?: string;
      support_email?: string;
    } | null;
    
    const edcInfo = partnerInfo ? {
      programName: partnerInfo.program_name || partnerInfo.name || 'Moil Partners',
      fullName: partnerInfo.name || 'Moil Partners',
      logo: partnerInfo.logo_url || 'https://res.cloudinary.com/drlcisipo/image/upload/v1705704261/Website%20images/logo_gox0fw.png',
      logoInitial: partnerInfo.logo_initial || partnerInfo.name?.charAt(0) || 'M',
      primaryColor: partnerInfo.primary_color || '#5843BE',
      supportEmail: partnerInfo.support_email || 'support@moilapp.com',
      licenseDuration: '12 months',
    } : undefined;

    // Send invitation email
    const baseUrl = getBaseUrl();
    const inviteUrl = `${baseUrl}/invite/accept?token=${invitation.token}`;
    const signupUrl = `${baseUrl}/signup?invite=${invitation.token}&team=${team.id}&teamName=${encodeURIComponent(team.name)}`;
    
    const emailResult = await sendTeamInvitationEmail({
      email: normalizedEmail,
      inviterName,
      teamName: team.name,
      teamId: team.id,
      inviteUrl,
      signupUrl,
      role,
      edc: edcInfo,
    });

    if (!emailResult.success) {
      console.error('Failed to send invitation email:', emailResult.error);
      // Don't fail the request, invitation is still created
    }

    // Log activity
    await supabase.rpc('log_activity', {
      p_team_id: team.id,
      p_admin_id: user.id,
      p_activity_type: 'member_invited',
      p_description: `Invited ${normalizedEmail} to join the team as ${role}`,
      p_metadata: { invited_email: normalizedEmail, role }
    });

    return NextResponse.json({ 
      success: true, 
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expires_at,
      },
      emailSent: emailResult.success,
    });
  } catch (error) {
    console.error('Invite member error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Cancel/revoke an invitation
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { invitationId } = await request.json();

    if (!invitationId) {
      return NextResponse.json({ error: 'Invitation ID is required' }, { status: 400 });
    }

    // Get user's team membership
    const { data: teamMember, error: teamError } = await supabase
      .from('team_members')
      .select('role, team_id')
      .eq('admin_id', user.id)
      .single();

    if (teamError || !teamMember) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Check if user has permission
    if (!['owner', 'admin'].includes(teamMember.role)) {
      return NextResponse.json({ 
        error: 'Only team owners and admins can cancel invitations' 
      }, { status: 403 });
    }

    // Delete the invitation
    const { error: deleteError } = await supabase
      .from('team_invitations')
      .delete()
      .eq('id', invitationId)
      .eq('team_id', teamMember.team_id)
      .eq('status', 'pending');

    if (deleteError) {
      console.error('Delete invitation error:', deleteError);
      return NextResponse.json({ error: 'Failed to cancel invitation' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Cancel invitation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
