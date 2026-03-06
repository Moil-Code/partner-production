import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const body = await request.json();
    const { purchasedLicenseCount } = body;

    if (purchasedLicenseCount === undefined || purchasedLicenseCount < 0) {
      return NextResponse.json(
        { error: 'Valid purchased license count is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify user is authenticated and is a moil admin
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please login.' },
        { status: 401 }
      );
    }

    // Check if user is a moil admin
    const { data: adminData, error: adminError } = await supabase
      .from('admins')
      .select('global_role')
      .eq('id', user.id)
      .single();

    if (adminError || !adminData || adminData.global_role !== 'moil_admin') {
      return NextResponse.json(
        { error: 'Access denied. Moil admin access required.' },
        { status: 403 }
      );
    }

    // Use admin client to update the team
    const supabaseAdmin = createAdminClient();

    const { data: updatedTeam, error: updateError } = await supabaseAdmin
      .from('teams')
      .update({ purchased_license_count: purchasedLicenseCount })
      .eq('id', teamId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating team license count:', updateError);
      return NextResponse.json(
        { error: 'Failed to update license count' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'License count updated successfully',
      team: updatedTeam,
    });

  } catch (error) {
    console.error('Error in update-license-count:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
