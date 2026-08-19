import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  internalApiKey,
  providedApiKey,
  notConfiguredBody,
} from '@/lib/internalApiKey';

/**
 * Read-only feed of license ASSIGNMENTS, for the Moil backend's seat roster.
 *
 * WHY THIS EXISTS — the two dates are not the same date.
 *
 * A partner admin assigns a license to an email address here; the founder
 * activates it in Moil days, weeks or months later. Moil's Mongo records only
 * the second event, because that is the first moment Moil hears about the seat
 * at all. So every "assigned_at" Moil could previously report was really an
 * ACTIVATION date, and for a partner reconciling seats against an agreement
 * that is the wrong number — it under-reports how long a seat has been
 * allocated, and it reports nothing at all for a seat nobody has activated yet.
 *
 * `licenses.created_at` is the real assignment moment: rows are inserted with
 * `is_activated: false` the instant an admin adds the address. This endpoint
 * hands that date to Moil so its roster can stop inferring it.
 *
 * ONLY `grant_kind = 'base'` ROWS ARE RETURNED. An add-on row is a temporary
 * tier upgrade layered on top of a live seat, so its `created_at` is when the
 * upgrade was granted — emitting it here would silently redate the seat to the
 * day of an unrelated event. That is exactly the class of wrong-but-plausible
 * data this feed exists to eliminate.
 *
 * AUTH: the shared secret, like the sibling /addon route and unlike /activate
 * and /backfill. Those two are matched by license UUID — the id is the
 * capability, and a caller who does not know it can do nothing. This endpoint
 * ENUMERATES, returning email addresses and business names, so knowing a UUID
 * is not a meaningful barrier. It FAILS CLOSED when the secret is unset: a
 * missing key must never read as "allow everyone", in any environment.
 *
 * INCREMENTAL BY DEFAULT. `updatedSince` plus keyset pagination on
 * (updated_at, id) lets the caller pull only what changed since its last
 * successful sync. Keyset rather than offset because rows are being inserted
 * while a long sync walks the table, and an offset would silently skip rows as
 * the earlier pages shift underneath it — a paging bug that shows up as a
 * partner mysteriously missing a handful of seats.
 */

// One string literal, deliberately not concatenated: supabase-js parses the
// select at the TYPE level, and a `+`-joined string widens to `string`, which
// makes it infer an error type for every row. The cast that silences that would
// also hide a genuinely wrong column name.
const SELECT_COLUMNS =
  'id, email, moil_user_id, business_name, business_type, is_activated, activated_at, plan_tier, billing_cycle, months, expires_at, created_at, updated_at, partner_id, team_id';

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

// Validated rather than passed through: an id that is not a UUID reaches
// PostgREST as a malformed filter, which fails the whole query with a 500 the
// caller cannot act on. Refusing it here names the actual mistake.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LicenseAssignmentRow = {
  id: string;
  email: string | null;
  moil_user_id: string | null;
  business_name: string | null;
  business_type: string | null;
  is_activated: boolean | null;
  activated_at: string | null;
  plan_tier: string | null;
  billing_cycle: string | null;
  months: number | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  partner_id: string | null;
  team_id: string | null;
};

export async function GET(request: NextRequest) {
  try {
    // Accepts INTERNAL_API_KEY or MOIL_INTERNAL_API_KEY — see lib/internalApiKey.
    const expectedKey = internalApiKey();
    if (!expectedKey) {
      console.error(
        '[licenses/assignments] no internal API key configured — refusing all requests.'
      );
      // The response names which DEPLOYMENT is missing it, not just the
      // variable: the caller cannot read this server's logs, and only the
      // VALUE is a secret.
      return NextResponse.json(notConfiguredBody('Assignments endpoint'), {
        status: 503,
      });
    }

    if (providedApiKey(request) !== expectedKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = request.nextUrl.searchParams;

    const rawLimit = Number.parseInt(params.get('limit') || '', 10);
    const limit = Number.isInteger(rawLimit)
      ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT)
      : DEFAULT_LIMIT;

    // An unparseable `updatedSince` is REFUSED rather than ignored. Silently
    // dropping it turns an incremental sync into a full-table read that still
    // reports success — the caller would record a fresh watermark it never
    // actually earned.
    const updatedSinceRaw = params.get('updatedSince');
    let updatedSince: string | null = null;
    if (updatedSinceRaw) {
      const parsed = new Date(updatedSinceRaw);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: 'updatedSince must be an ISO 8601 timestamp' },
          { status: 400 }
        );
      }
      updatedSince = parsed.toISOString();
    }

    // Keyset cursor: the (updated_at, id) of the last row the caller consumed.
    const cursorUpdatedAt = params.get('cursorUpdatedAt');
    const cursorId = params.get('cursorId');
    if ((cursorUpdatedAt && !cursorId) || (!cursorUpdatedAt && cursorId)) {
      return NextResponse.json(
        { error: 'cursorUpdatedAt and cursorId must be supplied together' },
        { status: 400 }
      );
    }

    // Optional partner scope. The admin portal's license-activity report is
    // always about ONE partner, and without this it would have to walk the
    // whole table and discard almost all of it — which is not merely slow, it
    // makes an incremental pull impossible to reason about, because the
    // watermark it earns covers rows it never showed anyone.
    //
    // An UNPARSEABLE value is refused rather than ignored, exactly like
    // `updatedSince`: silently dropping the filter would answer a
    // partner-scoped question with every partner's seats, and the caller has no
    // way to tell that from a partner who genuinely has that many.
    const partnerId = params.get('partnerId');
    if (partnerId !== null) {
      if (!UUID_RE.test(partnerId)) {
        return NextResponse.json(
          { error: 'partnerId must be a UUID' },
          { status: 400 }
        );
      }
    }

    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    let query = supabase
      .from('licenses')
      .select(SELECT_COLUMNS)
      // Base seats only — see the header. An add-on is not an assignment.
      .eq('grant_kind', 'base')
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })
      // One extra row so `hasMore` is a fact rather than an inference from a
      // full page, which is wrong exactly when the total is a multiple of limit.
      .limit(limit + 1);

    if (partnerId) query = query.eq('partner_id', partnerId);
    if (updatedSince) query = query.gte('updated_at', updatedSince);
    if (cursorUpdatedAt && cursorId) {
      // Strictly after (updated_at, id). `or` inside the tuple comparison is
      // what makes this safe when many rows share a timestamp — a plain
      // `gt('updated_at')` would skip the rest of a tied batch.
      query = query.or(
        `updated_at.gt.${cursorUpdatedAt},and(updated_at.eq.${cursorUpdatedAt},id.gt.${cursorId})`
      );
    }

    const { data, error } = await query;
    if (error) {
      console.error('[licenses/assignments] query failed:', error.message);
      return NextResponse.json(
        { error: 'Failed to read license assignments' },
        { status: 500 }
      );
    }

    const rows = (data as LicenseAssignmentRow[] | null) || [];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.length ? page[page.length - 1] : null;

    // Partner names come from a second lookup rather than a PostgREST embed.
    // An embedded relation defeats type inference in this repo (no generated
    // Database types), and the cast that silences it is exactly the kind that
    // renders every org as null without erroring if the shape is wrong. There
    // are few partners, the ids on a page are heavily repeated, and a failure
    // here costs a label rather than the feed.
    const partnerIds = [...new Set(page.map((r) => r.partner_id).filter(Boolean))] as string[];
    const partnerNames = new Map<string, string>();
    if (partnerIds.length) {
      const { data: partners, error: partnerErr } = await supabase
        .from('partners')
        .select('id, name')
        .in('id', partnerIds);
      if (partnerErr) {
        console.error('[licenses/assignments] partner name lookup failed:', partnerErr.message);
      }
      for (const p of (partners as { id: string; name: string | null }[] | null) || []) {
        if (p.name) partnerNames.set(p.id, p.name);
      }
    }

    return NextResponse.json(
      {
        success: true,
        generatedAt: new Date().toISOString(),
        count: page.length,
        hasMore,
        // Echoed back so the caller advances its watermark from what it was
        // actually served, never from its own clock — a caller-side clock is
        // how rows written during a sync get skipped forever.
        nextCursor: hasMore && last ? { updatedAt: last.updated_at, id: last.id } : null,
        assignments: page.map((r) => ({
          licenseId: r.id,
          email: r.email,
          moilUserId: r.moil_user_id,
          businessName: r.business_name || null,
          businessType: r.business_type || null,
          // THE POINT OF THIS ENDPOINT: when the seat was handed out.
          assignedAt: r.created_at,
          // Kept alongside so the caller can see the gap it has been reporting
          // as the assignment date, and reconcile rather than guess.
          activatedAt: r.activated_at,
          isActivated: r.is_activated === true,
          planTier: r.plan_tier,
          billingCycle: r.billing_cycle,
          months: r.months,
          expiresAt: r.expires_at,
          partnerId: r.partner_id,
          partnerName: r.partner_id ? partnerNames.get(r.partner_id) || null : null,
          teamId: r.team_id,
          updatedAt: r.updated_at,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('License assignments error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
