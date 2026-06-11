import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/partners/[id] - Get a specific partner
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

    // Only Moil admins or the partner's own admins can view
    if (!isMoilAdmin && !isOwnPartner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: partner, error } = await supabase
      .from('partners')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    return NextResponse.json({ partner });
  } catch (error) {
    console.error('Partner GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/partners/[id] - Update a partner
export async function PATCH(
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

    // Only Moil admins or the partner's own admins can update
    if (!isMoilAdmin && !isOwnPartner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    // Partner admins can update name and branding fields
    const partnerAdminAllowedFields = [
      'name',
      'program_name',
      'full_name',
      'primary_color',
      'secondary_color',
      'accent_color',
      'text_color',
      'logo_url',
      'logo_initial',
      'font_family',
      'support_email',
      'license_duration',
      'features'
    ];

    // Moil admins can update all fields including these restricted ones
    const moilAdminOnlyFields = ['domain', 'status'];

    // Filter update data based on role
    const updateData: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(body)) {
      if (partnerAdminAllowedFields.includes(key)) {
        // Convert name to lowercase to maintain consistency
        updateData[key] = key === 'name' && typeof value === 'string' ? value.toLowerCase() : value;
      } else if (isMoilAdmin && moilAdminOnlyFields.includes(key)) {
        updateData[key] = value;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data: partner, error: updateError } = await supabase
      .from('partners')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating partner:', updateError);
      return NextResponse.json({ error: 'Failed to update partner' }, { status: 500 });
    }

    // Log activity
    const activityType = body.status ? 
      (body.status === 'active' ? 'partner_activated' : 
       body.status === 'suspended' ? 'partner_suspended' : 'partner_updated') 
      : 'partner_updated';

    await supabase.from('activity_logs').insert({
      team_id: null,
      admin_id: user.id,
      partner_id: id,
      activity_type: activityType,
      description: `Updated partner: ${partner.name}`,
      metadata: { updated_fields: Object.keys(updateData) },
    });

    return NextResponse.json({ partner });
  } catch (error) {
    console.error('Partner PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/partners/[id] - Delete a partner (Moil admins only)
export async function DELETE(
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

    // Check if user is Moil admin
    const { data: admin } = await supabase
      .from('admins')
      .select('global_role')
      .eq('id', user.id)
      .single();

    if (admin?.global_role !== 'moil_admin') {
      return NextResponse.json({ error: 'Forbidden: Moil admin access required' }, { status: 403 });
    }

    // Get partner info before deletion
    const { data: partner } = await supabase
      .from('partners')
      .select('name')
      .eq('id', id)
      .single();

    if (!partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    // Delete partner
    const { error: deleteError } = await supabase
      .from('partners')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting partner:', deleteError);
      return NextResponse.json({ error: 'Failed to delete partner' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: `Partner "${partner.name}" deleted` });
  } catch (error) {
    console.error('Partner DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
