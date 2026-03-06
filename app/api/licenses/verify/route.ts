import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Public endpoint to verify license and organization
 * No authentication required - this is used by the mobile app
 * Usage: GET /api/licenses/verify?licenseId=xxx&orgSlug=xxx
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const licenseId = searchParams.get('licenseId');
    const orgSlug = searchParams.get('orgSlug');

    if (!licenseId || !orgSlug) {
      return NextResponse.json(
        {
          error: 'License ID and Organization Slug are required',
          verified: false,
          partnerVerified: false,
        },
        { status: 400 }
      );
    }

    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Query license separately
    const { data: license, error: licenseError } = await supabase
      .from('licenses')
      .select('*')
      .eq('id', licenseId)
      .single();

    // Query partner separately
    // Convert "nerds-labs" -> "nerds labs" (no capitalization needed, names are stored in lowercase)

    if (!orgSlug) {
      return NextResponse.json(
        {
          success: true,
          verified: license?.id == licenseId,
          partnerVerified: false,
        },
        { status: 200 }
      );
    }

    // Special case: moil-partner is always verified (for Moil-created licenses)
    if (orgSlug === "moil-partner") {
      return NextResponse.json({
        success: true,
        verified: license?.id == licenseId,
        partnerVerified: true,
      });
    }

    const partnerName = orgSlug.split('-').join(' ');

    const { data: partner, error: partnerError } = await supabase
      .from('partners')
      .select('id, name, domain, status')
      .ilike('name', partnerName)
      .eq('status', 'active')
      .single();

    if (partnerError || !partner) {
      return NextResponse.json(
        {
          success: true,
          verified: license?.id == licenseId,
          partnerVerified: false,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      success: true,
      verified: license?.id == licenseId,
      partnerVerified: partner?.name == partnerName,
    });

  } catch (error) {
    console.error('License verification error:', error);
    return NextResponse.json(
      {
        success: false,
        verified: false,
        partnerVerified: false,
      },
      { status: 500 }
    );
  }
}