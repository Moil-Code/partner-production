import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

// GET /api/partners - List all partners (Moil admins) or get current partner
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get admin info
    const { data: admin, error: adminError } = await supabase
      .from('admins')
      .select('id, partner_id, global_role')
      .eq('id', user.id)
      .single();

    if (adminError || !admin) {
      return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
    }

    const isMoilAdmin = admin.global_role === 'moil_admin';
    const searchParams = request.nextUrl.searchParams;
    const listAll = searchParams.get('all') === 'true';

    // Moil admins can list all partners
    if (isMoilAdmin && listAll) {
      const includeInactive = searchParams.get('includeInactive') === 'true';
      const page = parseInt(searchParams.get('page') || '1', 10);
      const limit = parseInt(searchParams.get('limit') || '50', 10);
      const search = searchParams.get('search') || '';
      
      const validPage = Math.max(1, page);
      const validLimit = Math.min(Math.max(1, limit), 100);
      const offset = (validPage - 1) * validLimit;
      
      let query = supabase.from('partners').select('*', { count: 'exact' });
      
      if (!includeInactive) {
        query = query.eq('status', 'active');
      }
      
      if (search) {
        query = query.or(`name.ilike.%${search}%,domain.ilike.%${search}%,program_name.ilike.%${search}%`);
      }
      
      const { data: partners, error, count } = await query
        .order('name')
        .range(offset, offset + validLimit - 1);
      
      if (error) {
        console.error('Error fetching partners:', error);
        return NextResponse.json({ error: 'Failed to fetch partners' }, { status: 500 });
      }
      
      const totalPages = Math.ceil((count || 0) / validLimit);
      
      return NextResponse.json({ 
        partners,
        pagination: {
          page: validPage,
          limit: validLimit,
          totalCount: count || 0,
          totalPages,
          hasNextPage: validPage < totalPages,
          hasPrevPage: validPage > 1,
        }
      });
    }

    // Otherwise, return the current user's partner
    if (!admin.partner_id) {
      return NextResponse.json({ partner: null });
    }

    const { data: partner, error: partnerError } = await supabase
      .from('partners')
      .select('*')
      .eq('id', admin.partner_id)
      .single();

    if (partnerError) {
      console.error('Error fetching partner:', partnerError);
      return NextResponse.json({ error: 'Failed to fetch partner' }, { status: 500 });
    }

    return NextResponse.json({ partner });
  } catch (error) {
    console.error('Partners GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/partners - Create a new partner (Moil admins only)
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
    
    // Validate required fields (simplified: name + domain only)
    if (!body.name || !body.domain) {
      return NextResponse.json({ error: 'Name and domain are required' }, { status: 400 });
    }

    // Validate partner name format (only alphanumeric and spaces for slug compatibility)
    const nameRegex = /^[a-z0-9\s]+$/i;
    if (!nameRegex.test(body.name.trim())) {
      return NextResponse.json({ error: 'Partner name can only contain letters, numbers, and spaces' }, { status: 400 });
    }

    // Validate domain format
    const domainRegex = /^[a-z0-9][a-z0-9\.-]*\.[a-z]{2,}$/;
    if (!domainRegex.test(body.domain.toLowerCase())) {
      return NextResponse.json({ error: 'Invalid domain format' }, { status: 400 });
    }

    // Use admin client (secret key) for moil-admin operations
    const supabaseAdmin = createAdminClient();

    // Check if domain already exists
    const { data: existingPartner } = await supabaseAdmin
      .from('partners')
      .select('id')
      .eq('domain', body.domain.toLowerCase())
      .single();

    if (existingPartner) {
      return NextResponse.json({ error: 'A partner with this domain already exists' }, { status: 400 });
    }

    // Create partner using admin client (moil-admin uses secret key)
    const { data: partner, error: createError } = await supabaseAdmin
      .from('partners')
      .insert({
        name: body.name.trim().toLowerCase(),
        domain: body.domain.toLowerCase().trim(),
        status: 'active',
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating partner:', createError);
      return NextResponse.json({ error: 'Failed to create partner' }, { status: 500 });
    }

    // Log activity using admin client
    await supabaseAdmin.from('activity_logs').insert({
      team_id: null,
      admin_id: user.id,
      partner_id: partner.id,
      activity_type: 'partner_created',
      description: `Created new partner: ${partner.name} (${partner.domain})`,
      metadata: { partner_id: partner.id, partner_name: partner.name, domain: partner.domain },
    });

    return NextResponse.json({ partner }, { status: 201 });
  } catch (error) {
    console.error('Partners POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
