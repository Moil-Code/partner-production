import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET - Get team activity logs
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const activityType = searchParams.get('type');

    // Get user's team
    const { data: teamMember, error: teamError } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('admin_id', user.id)
      .single();

    if (teamError || !teamMember) {
      // Admin is not in a team - return empty activities
      return NextResponse.json({
        activities: [],
        total: 0,
        limit,
        offset,
        hasTeam: false,
      });
    }

    // Build query
    let query = supabase
      .from('activity_logs')
      .select(`
        id,
        activity_type,
        description,
        metadata,
        created_at,
        admin:admins!activity_logs_admin_id_fkey (
          id,
          email,
          first_name,
          last_name
        )
      `, { count: 'exact' })
      .eq('team_id', teamMember.team_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Filter by activity type if provided
    if (activityType) {
      query = query.eq('activity_type', activityType);
    }

    const { data: activities, error: activitiesError, count } = await query;

    if (activitiesError) {
      console.error('Fetch activities error:', activitiesError);
      return NextResponse.json({ error: 'Failed to fetch activities' }, { status: 500 });
    }

    return NextResponse.json({
      activities: activities || [],
      total: count || 0,
      limit,
      offset,
      hasTeam: true,
    });
  } catch (error) {
    console.error('Get activities error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
