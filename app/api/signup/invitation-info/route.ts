import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// GET - Fetch team invitation info for signup (bypasses RLS using service role)
// This endpoint is public and does not require authentication
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Invitation token is required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

    if (!supabaseUrl) {
      console.error('Missing Supabase URL');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Use service role key if available, otherwise fall back to anon key
    const key = secretKey || anonKey;
    if (!key) {
      console.error('Missing Supabase key');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Fetch invitation info with team details
    const { data: invitation, error: inviteError } = await supabase
      .from('team_invitations')
      .select(`
        id,
        email,
        role,
        status,
        expires_at,
        team:teams (
          id,
          name,
          domain
        ),
        inviter:admins!team_invitations_invited_by_fkey (
          first_name,
          last_name,
          email
        )
      `)
      .eq('token', token)
      .maybeSingle();

    if (inviteError) {
      console.error('Error fetching invitation:', inviteError);
      return NextResponse.json({ error: 'Failed to fetch invitation info' }, { status: 500 });
    }

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json({ 
        error: 'This invitation has expired',
        expired: true 
      }, { status: 400 });
    }

    // Check if already used
    if (invitation.status !== 'pending') {
      return NextResponse.json({ 
        error: `This invitation has already been ${invitation.status}`,
        status: invitation.status 
      }, { status: 400 });
    }

    return NextResponse.json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expires_at,
        team: invitation.team,
        inviter: invitation.inviter,
      }
    });
  } catch (error) {
    console.error('Error in invitation-info API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
