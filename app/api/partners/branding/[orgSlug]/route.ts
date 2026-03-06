import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  try {
    const { orgSlug } = await params;

    console.log('🔍 Branding API - Received orgSlug:', orgSlug);

    if (!orgSlug) {
      return NextResponse.json(
        { error: 'Organization slug is required' },
        { status: 400, headers: corsHeaders() }
      );
    }

    // Use admin client to bypass RLS
    const supabaseAdmin = createAdminClient();

    // Reverse the slug transformation to get the original name
    // Convert "nerds-labs" -> "nerds labs" (no capitalization needed, names are stored in lowercase)
    const reversedName = orgSlug.split('-').join(' ');

    console.log('🔍 Reversed name from slug:', reversedName);
    console.log('🔍 Original slug:', orgSlug);

    // First try exact match on name
    let { data: partner, error } = await supabaseAdmin
      .from('partners')
      .select('id, name, program_name, domain, logo_url, logo_initial, primary_color, secondary_color, font_family, status')
      .ilike('name', reversedName)
      .single();

    // If no exact match on name, try exact match on program_name
    if (!partner) {
      const result = await supabaseAdmin
        .from('partners')
        .select('id, name, program_name, domain, logo_url, logo_initial, primary_color, secondary_color, font_family, status')
        .ilike('program_name', reversedName)
        .single();
      
      partner = result.data;
      error = result.error;
    }

    // If still no match, try partial match on both fields
    if (!partner) {
      const result = await supabaseAdmin
        .from('partners')
        .select('id, name, program_name, domain, logo_url, logo_initial, primary_color, secondary_color, font_family, status')
        .or(`name.ilike.%${reversedName}%,program_name.ilike.%${reversedName}%`)
        .limit(1)
        .single();
      
      partner = result.data;
      error = result.error;
    }

    console.log('🔍 Query result - Partner found:', partner?.name);
    console.log('🔍 Query result - Error:', error?.message);

    if (error || !partner) {
      // Try to find all partners to see what names exist
      const { data: allPartners } = await supabaseAdmin
        .from('partners')
        .select('name, program_name, status')
        .limit(10);
      
      console.log('🔍 Available partners:', allPartners?.map(p => ({ name: p.name, program_name: p.program_name })));
      
      return NextResponse.json(
        { 
          error: 'Partner not found',
          debug: {
            searchedSlug: orgSlug,
            reversedName: reversedName,
            availablePartners: allPartners?.map(p => ({ name: p.name, program_name: p.program_name })),
            supabaseError: error?.message
          }
        },
        { status: 404, headers: corsHeaders() }
      );
    }

    // Check if partner is active
    if (partner.status !== 'active') {
      return NextResponse.json(
        { error: 'Partner is not active' },
        { status: 403, headers: corsHeaders() }
      );
    }

    // Return branding information
    return NextResponse.json(
      {
        success: true,
        branding: {
          name: partner.program_name || partner.name,
          domain: partner.domain,
          logo: partner.logo_url,
          logoInitial: partner.logo_initial,
          primaryColor: partner.primary_color,
          secondaryColor: partner.secondary_color,
          fontFamily: partner.font_family,
        }
      },
      { status: 200, headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get partner branding error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

// CORS headers for external app access
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// Handle OPTIONS request for CORS preflight
export async function OPTIONS() {
  return NextResponse.json(
    {},
    { status: 200, headers: corsHeaders() }
  );
}
