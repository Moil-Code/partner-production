import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const adminId = searchParams.get('adminId');

    if (!adminId) {
      return NextResponse.json(
        { error: 'Admin ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get current admin user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please login.' },
        { status: 401 }
      );
    }

    // Verify user is a moil admin
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

    // Verify the requested adminId matches the logged-in user
    if (adminId !== user.id) {
      return NextResponse.json(
        { error: 'You can only view your own licenses' },
        { status: 403 }
      );
    }

    // Get all licenses created by this admin
    const { data: licenses, error: licensesError } = await supabase
      .from('licenses')
      .select('*')
      .eq('admin_id', adminId)
      .order('created_at', { ascending: false });

    if (licensesError) {
      console.error('Licenses fetch error:', licensesError);
      return NextResponse.json(
        { error: 'Failed to fetch licenses' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { 
        licenses: licenses || [],
        count: licenses?.length || 0
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get licenses error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
