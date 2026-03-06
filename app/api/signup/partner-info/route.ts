import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// GET - Fetch partner info for signup (bypasses RLS using service role)
// This endpoint is public and does not require authentication
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const partnerId = searchParams.get('partnerId');

    if (!partnerId) {
      return NextResponse.json({ error: 'Partner ID is required' }, { status: 400 });
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

    // Fetch partner info
    const { data: partner, error: partnerError } = await supabase
      .from('partners')
      .select('id, name, domain')
      .eq('id', partnerId)
      .maybeSingle();

    if (partnerError) {
      console.error('Error fetching partner:', partnerError);
      return NextResponse.json({ error: 'Failed to fetch partner info' }, { status: 500 });
    }

    if (!partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    // Check if partner already has an admin
    const { data: existingAdmins, error: adminError } = await supabase
      .from('admins')
      .select('id')
      .eq('partner_id', partnerId)
      .limit(1);

    if (adminError) {
      console.error('Error checking existing admins:', adminError);
    }

    const hasAdmin = !adminError && existingAdmins && existingAdmins.length > 0;

    return NextResponse.json({
      partner: {
        id: partner.id,
        name: partner.name,
        domain: partner.domain,
      },
      hasAdmin,
    });
  } catch (error) {
    console.error('Error in partner-info API:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
