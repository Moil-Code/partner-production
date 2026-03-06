import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

// POST /api/partners/create-with-team - Create partner and generate signup link
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is Moil admin
    const { data: admin } = await supabase
      .from('admins')
      .select('global_role')
      .eq('id', user.id)
      .single();

    if (admin?.global_role !== 'moil_admin') {
      return NextResponse.json({ error: 'Forbidden: Moil admin access required' }, { status: 403 });
    }

    const body = await request.json();
    
    // Validate required fields
    if (!body.partnerName?.trim()) {
      return NextResponse.json({ error: 'Partner name is required' }, { status: 400 });
    }

    if (!body.domain?.trim()) {
      return NextResponse.json({ error: 'Domain is required' }, { status: 400 });
    }

    // Validate domain format
    const domainRegex = /^[a-z0-9][a-z0-9\.-]*\.[a-z]{2,}$/i;
    if (!domainRegex.test(body.domain)) {
      return NextResponse.json({ error: 'Invalid domain format' }, { status: 400 });
    }

    const domain = body.domain.toLowerCase().trim();
    
    // Use admin client (service role) to bypass RLS for admin operations
    const supabaseAdmin = createAdminClient();
    
    // Check if domain already exists
    const { data: existingPartner } = await supabaseAdmin
      .from('partners')
      .select('id')
      .eq('domain', domain)
      .single();

    if (existingPartner) {
      return NextResponse.json({ error: 'A partner with this domain already exists' }, { status: 400 });
    }

    // Create partner using service role client (bypasses RLS)
    const { data: partner, error: partnerError } = await supabaseAdmin
      .from('partners')
      .insert({
        name: body.partnerName.trim().toLowerCase(),
        domain: domain,
        status: 'active',
        program_name: body.partnerName.trim(),
        full_name: body.partnerName.trim(),
        primary_color: body.primaryColor || '#6366F1',
        secondary_color: body.secondaryColor || '#8B5CF6',
        logo_initial: body.partnerName.trim().charAt(0).toUpperCase(),
        logo_url: body.logoUrl || null,
      })
      .select()
      .single();

    if (partnerError) {
      console.error('Error creating partner:', partnerError);
      return NextResponse.json({ error: 'Failed to create partner' }, { status: 500 });
    }

    // Log activity using service role client
    await supabaseAdmin.from('activity_logs').insert({
      team_id: null,
      admin_id: user.id,
      partner_id: partner.id,
      activity_type: 'partner_created',
      description: `Created new partner: ${partner.name} (${domain})`,
      metadata: { 
        partner_id: partner.id, 
        partner_name: partner.name, 
        domain: domain,
      },
    });

    // Generate signup link with partner ID
    // The partner admin will use this link to sign up and their account will be linked to this partner
    const signupLink = `/signup?partnerId=${partner.id}`;

    return NextResponse.json({ 
      partner,
      signupLink,
      message: 'Partner created successfully. Share the signup link with the partner admin.'
    }, { status: 201 });

  } catch (error) {
    console.error('Create partner error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
