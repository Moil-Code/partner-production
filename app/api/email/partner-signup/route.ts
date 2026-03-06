import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendPartnerSignupInviteEmail } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    // Verify user is authenticated and is a Moil admin
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
    const { email, partnerName, signupLink } = body;

    if (!email || !partnerName || !signupLink) {
      return NextResponse.json({ error: 'Email, partner name, and signup link are required' }, { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Send the email
    const result = await sendPartnerSignupInviteEmail({
      email,
      partnerName,
      signupLink,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to send email' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `Signup link sent to ${email}`,
      messageId: result.messageId 
    });

  } catch (error) {
    console.error('Error in partner-signup email API:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: 500 });
  }
}
