import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  resolveLicenseActor,
  loadManageableLicense,
  logLicenseActivity,
} from '@/lib/licenses/access';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();

    const actorResult = await resolveLicenseActor(supabase);
    if (!actorResult.ok) {
      return NextResponse.json(
        { error: actorResult.error },
        { status: actorResult.status }
      );
    }
    const { actor } = actorResult;

    const { licenseId, newEmail } = await request.json();

    if (!licenseId || !newEmail) {
      return NextResponse.json({ error: 'License ID and new email are required' }, { status: 400 });
    }

    const normalizedEmail = String(newEmail).trim().toLowerCase();

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    const licenseResult = await loadManageableLicense(
      supabase,
      actor,
      licenseId,
      'edit'
    );
    if (!licenseResult.ok) {
      return NextResponse.json(
        { error: licenseResult.error },
        { status: licenseResult.status }
      );
    }
    const { license } = licenseResult;

    // An activated license is tied to a live account — changing the address
    // would orphan it.
    if (license.is_activated) {
      return NextResponse.json(
        { error: 'Cannot edit email for activated licenses' },
        { status: 400 }
      );
    }

    if (normalizedEmail === (license.email as string)?.toLowerCase()) {
      return NextResponse.json(
        { message: 'License email is already set to that address' },
        { status: 200 }
      );
    }

    // Uniqueness is scoped to the workspace that owns the license, not the
    // caller's — a Moil admin may be editing another workspace's license.
    let existingQuery = supabase
      .from('licenses')
      .select('id')
      .eq('email', normalizedEmail)
      .neq('id', licenseId);

    if (license.team_id) {
      existingQuery = existingQuery.eq('team_id', license.team_id);
    } else {
      existingQuery = existingQuery.eq('admin_id', license.admin_id);
    }

    const { data: existing } = await existingQuery.maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'A license with this email already exists' },
        { status: 400 }
      );
    }

    const { error: updateError, count } = await supabase
      .from('licenses')
      .update({ email: normalizedEmail }, { count: 'exact' })
      .eq('id', licenseId);

    if (updateError) {
      console.error('License email update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update license email' },
        { status: 500 }
      );
    }

    // An update blocked by RLS succeeds with zero rows changed.
    if (count === 0) {
      return NextResponse.json(
        { error: 'You do not have permission to edit this license' },
        { status: 403 }
      );
    }

    await logLicenseActivity(supabase, actor, {
      license,
      activityType: 'license_email_updated',
      description: `Updated license email from ${license.email} to ${normalizedEmail}`,
      metadata: { license_id: licenseId, old_email: license.email, new_email: normalizedEmail },
    });

    return NextResponse.json(
      { message: 'License email updated successfully', email: normalizedEmail },
      { status: 200 }
    );

  } catch (error) {
    console.error('Update license email error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
