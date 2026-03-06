import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Public endpoint to activate a license
 * Called by external application
 * Updates business_name, business_type and sets license to activated
 */
export async function POST(request: Request) {
  try {
    const { licenseId, businessName, businessType } = await request.json();

    if (!licenseId || !businessName || !businessType) {
      return NextResponse.json(
        { error: 'License ID, business name, and business type are required' },
        { status: 400 }
      );
    }

    // Use service role key to bypass RLS for public access
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Check if license exists
    const { data: existingLicense, error: fetchError } = await supabase
      .from('licenses')
      .select('*')
      .eq('id', licenseId)
      .single();

    if (fetchError || !existingLicense) {
      return NextResponse.json(
        { error: 'License not found' },
        { status: 404 }
      );
    }

    if (existingLicense.is_activated) {
      return NextResponse.json(
        { error: 'License is already activated' },
        { status: 400 }
      );
    }

    // Update license with business info and activate
    const { data: updatedLicense, error: updateError } = await supabase
      .from('licenses')
      .update({
        business_name: businessName,
        business_type: businessType,
        is_activated: true,
        activated_at: new Date().toISOString()
      })
      .eq('id', licenseId)
      .select()
      .single();

    if (updateError) {
      console.error('Failed to activate license:', updateError);
      return NextResponse.json(
        { error: 'Failed to activate license' },
        { status: 500 }
      );
    }

    // Update admin's active_purchased_license_count
    const { error: adminUpdateError } = await supabase
      .from('admins')
      .update({
        active_purchased_license_count: supabase.rpc('increment', { 
          row_id: existingLicense.admin_id 
        })
      })
      .eq('id', existingLicense.admin_id);

    if (adminUpdateError) {
      console.error('Failed to update admin count:', adminUpdateError);
    }

    return NextResponse.json({
      success: true,
      message: 'License activated successfully',
      license: {
        id: updatedLicense.id,
        email: updatedLicense.email,
        business_name: updatedLicense.business_name,
        business_type: updatedLicense.business_type,
        is_activated: updatedLicense.is_activated,
        activated_at: updatedLicense.activated_at
      }
    }, { status: 200 });

  } catch (error) {
    console.error('License activation error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
