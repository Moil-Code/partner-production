import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  resolveLicenseActor,
  loadManageableLicense,
  logLicenseActivity,
} from '@/lib/licenses/access';

export async function DELETE(request: Request) {
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

    const body = await request.json();
    const { licenseId } = body;

    if (!licenseId) {
      return NextResponse.json(
        { error: 'License ID is required' },
        { status: 400 }
      );
    }

    const licenseResult = await loadManageableLicense(
      supabase,
      actor,
      licenseId,
      'delete'
    );
    if (!licenseResult.ok) {
      return NextResponse.json(
        { error: licenseResult.error },
        { status: licenseResult.status }
      );
    }
    const { license } = licenseResult;

    // Only allow deletion of non-activated licenses — an activated license is
    // backing a live account.
    if (license.is_activated) {
      return NextResponse.json(
        { error: 'Cannot delete an activated license. Only pending licenses can be deleted.' },
        { status: 400 }
      );
    }

    const { error: deleteError, count } = await supabase
      .from('licenses')
      .delete({ count: 'exact' })
      .eq('id', licenseId);

    if (deleteError) {
      console.error('Error deleting license:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete license' },
        { status: 500 }
      );
    }

    // A delete blocked by RLS reports success with zero rows removed. Surface
    // that instead of telling the user the license is gone when it isn't.
    if (count === 0) {
      return NextResponse.json(
        { error: 'You do not have permission to delete this license' },
        { status: 403 }
      );
    }

    await logLicenseActivity(supabase, actor, {
      license,
      activityType: 'license_deleted',
      description: `Deleted license for ${license.email}`,
      metadata: { license_id: licenseId, email: license.email },
    });

    return NextResponse.json({
      success: true,
      message: 'License deleted successfully',
    });

  } catch (error) {
    console.error('Delete license error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
