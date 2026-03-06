import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token || token.length < 32) {
      return NextResponse.json(
        { error: 'Invalid approval token' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Find the partner with this approval token
    const { data: partner, error: findError } = await supabase
      .from('partners')
      .select('id, name, domain, status, approval_token')
      .eq('approval_token', token)
      .single();

    if (findError || !partner) {
      return NextResponse.json(
        { error: 'Invalid or expired approval token' },
        { status: 404 }
      );
    }

    // Check if already approved
    if (partner.status === 'active') {
      return NextResponse.json({
        success: true,
        message: 'Partner already approved',
        partner: {
          id: partner.id,
          name: partner.name,
          domain: partner.domain,
          status: partner.status,
        },
        alreadyApproved: true,
      });
    }

    // Approve the partner - update status and clear the token
    const { error: updateError } = await supabase
      .from('partners')
      .update({ 
        status: 'active',
        approval_token: null, // Clear token after use for security
      })
      .eq('id', partner.id);

    if (updateError) {
      console.error('Error approving partner:', updateError);
      return NextResponse.json(
        { error: 'Failed to approve partner' },
        { status: 500 }
      );
    }

    // Update all admins with matching email domain to link them to this partner
    const { error: adminError } = await supabase
      .from('admins')
      .update({ 
        partner_id: partner.id,
        global_role: 'partner_admin'
      })
      .ilike('email', `%@${partner.domain}`);

    if (adminError) {
      console.error('Error updating admins:', adminError);
      // Don't fail - partner is already approved
    }

    return NextResponse.json({
      success: true,
      message: 'Partner approved successfully',
      partner: {
        id: partner.id,
        name: partner.name,
        domain: partner.domain,
        status: 'active',
      },
    });

  } catch (error) {
    console.error('Grant access error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
