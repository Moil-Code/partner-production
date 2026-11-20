import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  internalApiKey,
  providedApiKey,
  notConfiguredBody,
  unauthorizedBody,
} from '@/lib/internalApiKey';
import { parsePlanKey, LICENSE_PLANS, BILLING_CYCLES, type LicensePlan, type BillingCycle } from '@/lib/licensePlanDefaults';

/**
 * Endpoint to activate a license, called by the Moil backend ONLY.
 *
 * AUTH: the shared internal key (`x-internal-api-key`, lib/internalApiKey.ts),
 * failing closed like /reconcile: 503 when the key is not configured here,
 * 401 when it is missing or wrong. A license UUID is not a capability: the ids
 * travel in activation links, so anyone holding one could otherwise mark a
 * seat activated and set its business name. It stays on the middleware
 * allowlist because it carries no session.
 *
 * Updates business_name, business_type and sets license to activated.
 *
 * Optional body fields (newer Moil backend versions send these):
 *   - moilUserId: the Moil (MongoDB) user id
 *   - plan: resolved plan key, e.g. 'standard_yearly'
 *   - planTier / billingCycle: explicit plan fields (win over `plan`)
 *   - expiresAt: ISO date the granted plan expires
 */
export async function POST(request: Request) {
  const expectedKey = internalApiKey();
  if (!expectedKey) {
    console.error('[licenses/activate] no internal API key configured — refusing all requests.');
    return NextResponse.json(notConfiguredBody('Activate endpoint'), { status: 503 });
  }
  const presentedKey = providedApiKey(request);
  if (presentedKey !== expectedKey) {
    return NextResponse.json(unauthorizedBody(expectedKey, presentedKey), { status: 401 });
  }

  try {
    const {
      licenseId,
      businessName,
      businessType,
      moilUserId,
      plan,
      planTier,
      billingCycle,
      expiresAt,
    } = await request.json();

    if (!licenseId || !businessName || !businessType) {
      return NextResponse.json(
        { error: 'License ID, business name, and business type are required' },
        { status: 400 }
      );
    }

    // Use service role key to bypass RLS for public access
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Check if license exists
    const { data: existingLicense, error: fetchError } = await supabase
      .from('licenses')
      .select('*')
      .eq('id', licenseId)
      .single();

    if (fetchError || !existingLicense) {
      return NextResponse.json(
        { error: 'License not found' },
        { status: 404 }
      );
    }

    if (existingLicense.is_activated) {
      return NextResponse.json(
        { error: 'License is already activated' },
        { status: 400 }
      );
    }

    // Derive plan metadata: explicit planTier/billingCycle win over the
    // resolved `plan` key (e.g. 'standard_yearly'). All optional.
    const resolvedPlan = parsePlanKey(plan);
    const finalPlanTier =
      typeof planTier === 'string' && LICENSE_PLANS.includes(planTier as LicensePlan)
        ? planTier
        : resolvedPlan?.planTier;
    const finalBillingCycle =
      typeof billingCycle === 'string' && BILLING_CYCLES.includes(billingCycle as BillingCycle)
        ? billingCycle
        : resolvedPlan?.billingCycle;

    // Update license with business info and activate
    const { data: updatedLicense, error: updateError } = await supabase
      .from('licenses')
      .update({
        business_name: businessName,
        business_type: businessType,
        is_activated: true,
        activated_at: new Date().toISOString(),
        ...(typeof moilUserId === 'string' && moilUserId ? { moil_user_id: moilUserId } : {}),
        ...(finalPlanTier ? { plan_tier: finalPlanTier } : {}),
        ...(finalBillingCycle ? { billing_cycle: finalBillingCycle } : {}),
        ...(typeof expiresAt === 'string' && expiresAt ? { expires_at: expiresAt } : {}),
      })
      .eq('id', licenseId)
      // Only the call that flips the seat counts it: two activations of the
      // same seat at once used to both pass the is_activated check above and
      // both add one to the admin's active count.
      .eq('is_activated', false)
      .select()
      .maybeSingle();

    if (!updateError && !updatedLicense) {
      return NextResponse.json(
        { error: 'License is already activated' },
        { status: 400 }
      );
    }

    if (updateError || !updatedLicense) {
      console.error('Failed to activate license:', updateError);
      return NextResponse.json(
        { error: 'Failed to activate license' },
        { status: 500 }
      );
    }

    // Increment the admin's active_purchased_license_count.
    // Best effort — a failure here must not fail the activation.
    //
    // Skipped for add-ons: an add-on is a time-boxed tier upgrade on top of a
    // licensee's existing license, not a new licensee. Counting it would show
    // a partner two active licenses for one person and burn a seat they paid
    // for. `grant_kind` may be absent on a row written before the add-on
    // migration, so the check is "not an addon" rather than "is base".
    const isAddon = existingLicense.grant_kind === 'addon';
    if (existingLicense.admin_id && !isAddon) {
      try {
        // One atomic UPDATE (database/add_license_purchase_fulfillment.sql).
        // Falls back to the old read-then-write until that SQL is applied.
        const { error: rpcError } = await supabase.rpc(
          'increment_admin_active_license_count',
          { p_admin_id: existingLicense.admin_id },
        );
        if (rpcError) {
          console.error('increment_admin_active_license_count failed, using fallback:', rpcError.code);
          const { data: adminRow, error: adminFetchError } = await supabase
            .from('admins')
            .select('active_purchased_license_count')
            .eq('id', existingLicense.admin_id)
            .single();

          if (adminFetchError || !adminRow) {
            console.error('Failed to fetch admin for count update:', adminFetchError);
          } else {
            const { error: adminUpdateError } = await supabase
              .from('admins')
              .update({
                active_purchased_license_count:
                  (adminRow.active_purchased_license_count || 0) + 1,
              })
              .eq('id', existingLicense.admin_id);

            if (adminUpdateError) {
              console.error('Failed to update admin count:', adminUpdateError);
            }
          }
        }
      } catch (countError) {
        console.error('Admin count update failed (non-fatal):', countError);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'License activated successfully',
      license: {
        id: updatedLicense.id,
        email: updatedLicense.email,
        business_name: updatedLicense.business_name,
        business_type: updatedLicense.business_type,
        is_activated: updatedLicense.is_activated,
        activated_at: updatedLicense.activated_at,
        plan_tier: updatedLicense.plan_tier ?? null,
        billing_cycle: updatedLicense.billing_cycle ?? null,
        expires_at: updatedLicense.expires_at ?? null,
        moil_user_id: updatedLicense.moil_user_id ?? null,
      }
    }, { status: 200 });

  } catch (error) {
    console.error('License activation error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
