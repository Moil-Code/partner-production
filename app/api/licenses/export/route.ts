import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is an admin (and fetch partner for the export filename)
    const { data: admin, error: adminError } = await supabase
      .from('admins')
      .select('id, partner:partners(name, program_name, domain)')
      .eq('id', user.id)
      .single();

    if (adminError || !admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const partnerInfo = admin.partner as unknown as {
      name?: string;
      program_name?: string;
      domain?: string;
    } | null;

    // Get user's team
    const { data: teamMember } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('admin_id', user.id)
      .single();

    const teamId = teamMember?.team_id;

    // Fetch all licenses for the team (or admin if no team)
    let licensesQuery = supabase
      .from('licenses')
      .select('*')
      .order('created_at', { ascending: false });

    if (teamId) {
      licensesQuery = licensesQuery.eq('team_id', teamId);
    } else {
      licensesQuery = licensesQuery.eq('admin_id', user.id);
    }

    const { data: licenses, error: licensesError } = await licensesQuery;

    if (licensesError) {
      return NextResponse.json({ error: 'Failed to fetch licenses' }, { status: 500 });
    }

    // Generate CSV
    // 'Type' distinguishes a licensee's own license from a time-boxed tier
    // upgrade granted on top of one. Without it an export of 12 rows can be
    // 9 people, and nothing in the file says so.
    const headers = ['Email', 'Type', 'Status', 'Plan Tier', 'Billing Cycle', 'Expires', 'Date Added', 'Activated At'];
    const rows = licenses.map(license => [
      license.email,
      license.grant_kind === 'addon' ? 'Add-on' : 'License',
      license.is_activated ? 'Active' : 'Pending',
      license.plan_tier || 'N/A',
      license.billing_cycle || 'N/A',
      license.expires_at ? new Date(license.expires_at).toLocaleDateString() : 'N/A',
      new Date(license.created_at).toLocaleDateString(),
      license.activated_at ? new Date(license.activated_at).toLocaleDateString() : 'N/A',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    // Derive filename from the caller's partner, falling back to a generic name.
    const partnerLabel = partnerInfo?.name || partnerInfo?.program_name || partnerInfo?.domain;
    const partnerSlug = partnerLabel
      ? partnerLabel
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '')
      : '';
    const filename = `${partnerSlug || 'moil-partner'}-licenses-${new Date().toISOString().split('T')[0]}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error('CSV export error:', error);
    return NextResponse.json(
      { error: 'Failed to export CSV' },
      { status: 500 }
    );
  }
}
