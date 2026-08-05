import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { isMoilAdmin } from '@/lib/licenseIssuePolicy';

/**
 * List plan add-ons — MOIL STAFF ONLY.
 *
 * An add-on is a time-boxed tier upgrade Moil grants a founder on top of the
 * license they already hold. The partner did not issue it, is not billed for
 * it, and must not see it: add-on rows deliberately carry NULL `team_id` and
 * `admin_id`, which is what keeps them out of every partner-scoped read.
 *
 * That same NULL is why this endpoint exists. The moil-admin dashboard lists
 * licenses by `admin_id`, so it would never surface an add-on; this reads them
 * directly and joins the partner the licensee originally came in through, plus
 * the base license the add-on sits on, so the dashboard can show both.
 *
 * Read-only. Granting goes through /api/licenses/grant-addon.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized. Please login.' }, { status: 401 });
    }

    const { data: adminData, error: adminError } = await supabase
      .from('admins')
      .select('global_role, email')
      .eq('id', user.id)
      .single();

    if (adminError || !adminData || !isMoilAdmin(adminData)) {
      return NextResponse.json(
        { error: 'Access denied. Moil admin access required.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const partnerId = searchParams.get('partnerId');
    // Default to live add-ons only — an admin opening this wants to know who
    // currently has extra access, not the whole history.
    const includeExpired = searchParams.get('includeExpired') === 'true';

    // Service role: add-on rows have no team/admin, so an RLS-bound read as the
    // user would return nothing. Safe here — the caller is verified Moil staff
    // directly above, and add-ons are a Moil-owned concept.
    const adminSupabase = createAdminClient();

    let query = adminSupabase
      .from('licenses')
      .select(
        'id, email, plan_tier, starts_at, expires_at, parent_license_id, partner_id, moil_user_id, created_at'
      )
      .eq('grant_kind', 'addon')
      .order('expires_at', { ascending: true });

    if (partnerId) query = query.eq('partner_id', partnerId);
    if (!includeExpired) query = query.gt('expires_at', new Date().toISOString());

    const { data: addons, error: addonsError } = await query;

    if (addonsError) {
      console.error('[licenses/addons] fetch failed:', addonsError);
      return NextResponse.json({ error: 'Failed to fetch add-ons' }, { status: 500 });
    }

    const rows = addons || [];

    // Resolve the partner name and the base license in two batched lookups
    // rather than per row.
    const partnerIds = [...new Set(rows.map((r) => r.partner_id).filter(Boolean))];
    const baseIds = [...new Set(rows.map((r) => r.parent_license_id).filter(Boolean))];

    const [partnersRes, baseRes] = await Promise.all([
      partnerIds.length
        ? adminSupabase
            .from('partners')
            .select('id, name, program_name')
            .in('id', partnerIds)
        : Promise.resolve({ data: [] as { id: string; name: string; program_name?: string }[] }),
      baseIds.length
        ? adminSupabase
            .from('licenses')
            .select('id, plan_tier, billing_cycle, expires_at, is_activated')
            .in('id', baseIds)
        : Promise.resolve({
            data: [] as {
              id: string;
              plan_tier: string | null;
              billing_cycle: string | null;
              expires_at: string | null;
              is_activated: boolean;
            }[],
          }),
    ]);

    const partnerById = new Map(
      (partnersRes.data || []).map((p) => [p.id, p.program_name || p.name])
    );
    const baseById = new Map((baseRes.data || []).map((b) => [b.id, b]));

    const now = Date.now();

    return NextResponse.json(
      {
        addons: rows.map((r) => {
          const base = r.parent_license_id ? baseById.get(r.parent_license_id) : null;
          return {
            id: r.id,
            email: r.email,
            planTier: r.plan_tier,
            startsAt: r.starts_at,
            expiresAt: r.expires_at,
            // Derived rather than stored: `expires_at` is the authority on
            // every other surface too, so this cannot drift from it.
            active: r.expires_at ? Date.parse(r.expires_at) > now : false,
            partnerId: r.partner_id,
            partnerName: r.partner_id ? partnerById.get(r.partner_id) || null : null,
            moilUserId: r.moil_user_id,
            basePlan: base
              ? {
                  planTier: base.plan_tier,
                  billingCycle: base.billing_cycle,
                  expiresAt: base.expires_at,
                  isActivated: base.is_activated,
                }
              : null,
            createdAt: r.created_at,
          };
        }),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[licenses/addons] error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
