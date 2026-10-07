import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { resolveLicenseActor } from '@/lib/licenses/access';

/**
 * Live plan add-ons on the caller's OWN licensees, so the partner dashboard can
 * show them and offer "Remove add-on".
 *
 * Add-on rows carry no team or admin on purpose (they are not seats, and they
 * must stay out of every seat count), so they cannot be scoped directly. They
 * are found through the licensee's BASE license instead: the caller's base
 * licenses in their team (or created by them, when solo) give the set of emails,
 * and only add-ons for those emails are returned.
 *
 * Read-only, and it exposes nothing but the tier and the dates — never who
 * granted it or why. Granting stays Moil-only (/api/licenses/grant-addon).
 */

// Emails go in an `in (...)` filter; chunked so the request URL stays small.
const CHUNK = 100;
// A scope larger than this is truncated, and the response says so rather than
// presenting a partial list as the whole.
const MAX_BASE_LICENSES = 2000;

export async function GET() {
  try {
    const supabase = await createClient();
    const actorRes = await resolveLicenseActor(supabase);
    if (!actorRes.ok) {
      return NextResponse.json({ error: actorRes.error }, { status: actorRes.status });
    }
    const { actor } = actorRes;

    const admin = createAdminClient();

    let base = admin
      .from('licenses')
      .select('email')
      .eq('grant_kind', 'base')
      .limit(MAX_BASE_LICENSES + 1);
    base = actor.teamId ? base.eq('team_id', actor.teamId) : base.eq('admin_id', actor.userId);

    const { data: baseRows, error: baseError } = await base;
    if (baseError) {
      console.error('[licenses/my-addons] base lookup failed:', baseError);
      return NextResponse.json({ error: 'Failed to load add-ons' }, { status: 500 });
    }

    const truncated = (baseRows?.length || 0) > MAX_BASE_LICENSES;
    const emails = [
      ...new Set((baseRows || []).slice(0, MAX_BASE_LICENSES).map((r) => String(r.email).toLowerCase())),
    ];

    const nowIso = new Date().toISOString();
    const addons: {
      id: string;
      email: string;
      planTier: string | null;
      startsAt: string | null;
      expiresAt: string | null;
      state: 'active' | 'scheduled';
    }[] = [];

    for (let i = 0; i < emails.length; i += CHUNK) {
      const { data, error } = await admin
        .from('licenses')
        .select('id, email, plan_tier, starts_at, expires_at')
        .eq('grant_kind', 'addon')
        .in('email', emails.slice(i, i + CHUNK))
        .gt('expires_at', nowIso);
      if (error) {
        console.error('[licenses/my-addons] addon lookup failed:', error);
        return NextResponse.json({ error: 'Failed to load add-ons' }, { status: 500 });
      }
      for (const r of data || []) {
        const begins = r.starts_at ? Date.parse(r.starts_at) : NaN;
        addons.push({
          id: r.id,
          email: String(r.email).toLowerCase(),
          planTier: r.plan_tier ?? null,
          startsAt: r.starts_at ?? null,
          expiresAt: r.expires_at ?? null,
          // A grant dated to open later has a future expiry too; labelling it
          // active would tell an admin the upgrade is already live.
          state: !Number.isNaN(begins) && begins > Date.now() ? 'scheduled' : 'active',
        });
      }
    }

    return NextResponse.json({ addons, truncated }, { status: 200 });
  } catch (error) {
    console.error('[licenses/my-addons] error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
