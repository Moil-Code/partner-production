import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBatchEmailStatuses } from '@/lib/email';

export async function POST(request: Request) {
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

    // Get user's team
    const { data: teamMember } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('admin_id', user.id)
      .single();

    const teamId = teamMember?.team_id;

    // `onlyPending`: skip seats that are already activated. Their email has
    // done its job, and each Resend lookup goes through the 2 req/s queue, so
    // re-checking them is most of the wait on a large list. Optional so the
    // partner dashboard's existing call is unchanged.
    let onlyPending = false;
    try {
      const body = await request.json();
      onlyPending = body?.onlyPending === true;
    } catch {
      // No body — the original call shape.
    }

    // Get all licenses with message_ids that need status updates
    let licensesQuery = supabase
      .from('licenses')
      .select('id, message_id')
      .not('message_id', 'is', null);

    if (onlyPending) licensesQuery = licensesQuery.eq('is_activated', false);

    if (teamId) {
      licensesQuery = licensesQuery.eq('team_id', teamId);
    } else {
      licensesQuery = licensesQuery.eq('admin_id', user.id);
    }

    const { data: licenses } = await licensesQuery;

    if (!licenses || licenses.length === 0) {
      return NextResponse.json(
        { message: 'No licenses with message IDs found', synced: 0 },
        { status: 200 }
      );
    }

    // Extract message IDs
    const messageIds = licenses.map(license => license.message_id!);

    // Fetch email statuses from Resend
    const statusResult = await getBatchEmailStatuses(messageIds);

    if (!statusResult.success) {
      console.error('Failed to fetch email statuses:', statusResult.error);
      return NextResponse.json(
        { error: 'Failed to fetch email statuses from Resend' },
        { status: 500 }
      );
    }

    const statuses = statusResult.statuses as Record<string, string>;

    // Update database with fetched statuses
    const updatePromises = licenses.map(async (license) => {
      const messageId = license.message_id!;
      const status = statuses[messageId];
      if (status) {
        await supabase
          .from('licenses')
          .update({ email_status: status })
          .eq('id', license.id);
      }
    });

    await Promise.all(updatePromises);

    return NextResponse.json(
      { 
        message: 'Email statuses synced successfully',
        synced: licenses.length,
        statuses 
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Sync email statuses error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
