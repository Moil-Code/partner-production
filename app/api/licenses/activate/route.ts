import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { parsePlanKey, LICENSE_PLANS, BILLING_CYCLES, type LicensePlan, type BillingCycle } from '@/lib/licensePlanDefaults';
import { isPartnerApiKeyValid } from '@/lib/partnerApiKey';

/**
 * Public endpoint to activate a license
 * Called by external application (the Moil backend)
 * Updates business_name, business_type and sets license to activated.
 *
 * Optional body fields (newer Moil backend versions send these):
 *   - moilUserId: the Moil (MongoDB) user id
 *   - plan: resolved plan key, e.g. 'standard_yearly'
 *   - planTier / billingCycle: explicit plan fields (win over `plan`)
 *   - expiresAt: ISO date the granted plan expires
 *
 * Optional auth: when PARTNER_SERVICE_API_KEY is set, the request must
 * include a matching `x-partner-api-key` header.
 */
export async function POST(request: Request) {
  try {
    if (!isPartnerApiKeyValid(request)) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

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
      .select()
      .single();

    if (updateError) {
      console.error('Failed to activate license:', updateError);
      return NextResponse.json(
        { error: 'Failed to activate license' },
        { status: 500 }
      );
    }

    // Increment the admin's active_purchased_license_count.
    // Best effort — a failure here must not fail the activation.
    if (existingLicense.admin_id) {
      try {
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
