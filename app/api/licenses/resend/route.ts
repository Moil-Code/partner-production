import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveLicenseActor, LICENSE_ADMIN_COLUMNS } from '@/lib/licenses/access';
import {
  resendActivationEmail,
  PARTNER_BRANDING_COLUMNS,
} from '@/lib/licenses/resendActivation';

// Minimum gap between two sends for the same license. Guards against
// accidental double-sends / mashing the resend button in the dashboard.
const RESEND_COOLDOWN_MS = 60 * 1000;

export async function POST(request: Request) {
  try {
    const { licenseId } = await request.json();

    if (!licenseId) {
      return NextResponse.json(
        { error: 'License ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Resolve the caller, pulling their own partner branding along with the
    // admin record so it can serve as the branding fallback.
    const actorResult = await resolveLicenseActor(supabase, {
      adminSelect: `${LICENSE_ADMIN_COLUMNS}, partner:partners(${PARTNER_BRANDING_COLUMNS})`,
    });
    if (!actorResult.ok) {
      return NextResponse.json(
        { error: actorResult.error },
        { status: actorResult.status }
      );
    }

    const outcome = await resendActivationEmail(supabase, actorResult.actor, licenseId, {
      minGapMs: RESEND_COOLDOWN_MS,
    });

    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    }

    return NextResponse.json(
      {
        message: 'Activation email resent successfully',
        email: outcome.email,
        sentAt: outcome.sentAt,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Resend email error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
