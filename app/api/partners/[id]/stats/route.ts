import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/partners/[id]/stats - Get partner statistics
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get admin info
    const { data: admin } = await supabase
      .from('admins')
      .select('partner_id, global_role')
      .eq('id', user.id)
      .single();

    const isMoilAdmin = admin?.global_role === 'moil_admin';
    const isOwnPartner = admin?.partner_id === id;

    // Only Moil admins or the partner's own admins can view stats
    if (!isMoilAdmin && !isOwnPartner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get license counts
    const { data: licenses } = await supabase
      .from('licenses')
      .select('id, is_activated')
      .eq('partner_id', id);

    const totalLicenses = licenses?.length || 0;
    const activatedLicenses = licenses?.filter(l => l.is_activated).length || 0;
    const pendingLicenses = totalLicenses - activatedLicenses;

    // Get team count
    const { count: teamCount } = await supabase
      .from('teams')
      .select('id', { count: 'exact', head: true })
      .eq('partner_id', id);

    // Get admin count
    const { count: adminCount } = await supabase
      .from('admins')
      .select('id', { count: 'exact', head: true })
      .eq('partner_id', id);

    // Get purchased license count (sum from all admins in partner)
    const { data: admins } = await supabase
      .from('admins')
      .select('purchased_license_count')
      .eq('partner_id', id);

    const totalPurchased = admins?.reduce((sum, a) => sum + (a.purchased_license_count || 0), 0) || 0;

    const stats = {
      total_licenses: totalLicenses,
      activated_licenses: activatedLicenses,
      pending_licenses: pendingLicenses,
      total_teams: teamCount || 0,
      total_admins: adminCount || 0,
      total_purchased_licenses: totalPurchased,
      available_licenses: totalPurchased - totalLicenses,
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Partner stats error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
