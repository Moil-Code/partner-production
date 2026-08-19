import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  internalApiKey,
  providedApiKey,
  notConfiguredBody,
} from '@/lib/internalApiKey';

/**
 * Read-only directory of partners, for the Moil admin portal's license
 * activity reporting.
 *
 * WHY THIS EXISTS. The admin portal needs to let a human pick a partner before
 * it can show anything, and until now the only list of partners lived behind a
 * partner-app browser session. The sibling `/api/licenses/assignments` feed
 * already hands Moil every license row, but a caller cannot build a partner
 * picker out of it without pulling the ENTIRE license table first and
 * distinct-ing the partner ids client-side — which is O(licenses) work to
 * answer an O(partners) question, and it silently omits any partner that has
 * not issued a license yet.
 *
 * THE COUNTS ARE ISSUED AND ACTIVATED, AND NOTHING ELSE. Everything richer —
 * activation rate over a window, active users, per-user metrics — needs Moil's
 * own activity data, which this app does not have and must not pretend to. A
 * count this endpoint could compute wrongly is worse than one it declines to
 * compute at all.
 *
 * `grant_kind = 'base'` ONLY, for the same reason the assignments feed does it:
 * an add-on row is a tier upgrade layered on a live seat, not a seat. Counting
 * add-ons here would report more licenses issued than seats exist, and the
 * discrepancy would only ever surface as the roster and the summary card
 * disagreeing — with nothing erroring.
 *
 * AUTH: the shared secret, like `/assignments` and `/addon`. This route
 * ENUMERATES partner organisations, so it fails closed when the key is unset.
 */

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

// A partner table this large means the picker needs server-side search rather
// than a client filter; until then, refusing to count past the cap is better
// than reporting a total that is silently short.
const COUNT_CAP = 100000;

type PartnerRow = {
  id: string;
  name: string | null;
  domain: string | null;
  status: string | null;
  program_name: string | null;
  logo_url: string | null;
  license_duration: number | null;
  created_at: string;
};

type LicenseCountRow = {
  partner_id: string | null;
  is_activated: boolean | null;
};

export async function GET(request: NextRequest) {
  try {
    // Accepts INTERNAL_API_KEY or MOIL_INTERNAL_API_KEY — see lib/internalApiKey.
    const expectedKey = internalApiKey();
    if (!expectedKey) {
      console.error(
        '[partners/directory] no internal API key configured — refusing all requests.'
      );
      // The response names which DEPLOYMENT is missing it, not just the
      // variable: the caller cannot read this server's logs, and only the
      // VALUE is a secret.
      return NextResponse.json(notConfiguredBody('Partner directory endpoint'), {
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

    const search = (params.get('search') || '').trim();
    // Counting every partner's licenses is the expensive half of this call, and
    // a caller rendering only a picker does not need it. Opt-in rather than
    // opt-out so the cheap shape is the one a naive caller gets.
    const withCounts = params.get('withCounts') === 'true';

    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    let query = supabase
      .from('partners')
      .select(
        'id, name, domain, status, program_name, logo_url, license_duration, created_at'
      )
      .order('name', { ascending: true })
      .limit(limit);

    if (search) {
      // Escaping the PostgREST `or` metacharacters matters: a comma in the
      // search term would otherwise be read as a filter separator and the whole
      // expression would parse as something the caller never asked for.
      const safe = search.replace(/[,()*]/g, ' ').trim();
      if (safe) query = query.or(`name.ilike.%${safe}%,domain.ilike.%${safe}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[partners/directory] query failed:', error.message);
      return NextResponse.json(
        { error: 'Failed to read partners' },
        { status: 500 }
      );
    }

    const partners = (data as PartnerRow[] | null) || [];

    // issued / activated per partner. Read as rows rather than as N count
    // queries: one round trip beats one per partner, and the projection is two
    // small columns.
    const counts = new Map<string, { issued: number; activated: number }>();
    let countsTruncated = false;
    if (withCounts && partners.length) {
      const ids = partners.map((p) => p.id);
      const { data: licRows, error: licErr } = await supabase
        .from('licenses')
        .select('partner_id, is_activated')
        .eq('grant_kind', 'base')
        .in('partner_id', ids)
        .limit(COUNT_CAP + 1);

      if (licErr) {
        // A failure here costs the counts, never the directory — the picker is
        // the primary job and it works without them. `countsAvailable: false`
        // travels with the response so a zero can never be mistaken for a
        // partner that has issued nothing.
        console.error('[partners/directory] license count failed:', licErr.message);
      } else {
        const rows = (licRows as LicenseCountRow[] | null) || [];
        countsTruncated = rows.length > COUNT_CAP;
        for (const r of rows.slice(0, COUNT_CAP)) {
          if (!r.partner_id) continue;
          const c = counts.get(r.partner_id) || { issued: 0, activated: 0 };
          c.issued += 1;
          if (r.is_activated === true) c.activated += 1;
          counts.set(r.partner_id, c);
        }
      }
    }

    const countsAvailable = withCounts && counts.size > 0;

    return NextResponse.json(
      {
        success: true,
        generatedAt: new Date().toISOString(),
        count: partners.length,
        // True when the page is full, so the caller knows to narrow with
        // `search` rather than assuming it has seen every partner.
        hasMore: partners.length >= limit,
        countsAvailable,
        countsTruncated,
        partners: partners.map((p) => {
          const c = counts.get(p.id);
          return {
            partnerId: p.id,
            name: p.name,
            domain: p.domain,
            status: p.status,
            programName: p.program_name,
            logoUrl: p.logo_url,
            licenseDurationDays: p.license_duration,
            createdAt: p.created_at,
            // `null`, not 0, when we did not count. A partner with no licenses
            // and a partner we declined to count must not render alike.
            licensesIssued: withCounts ? (c ? c.issued : 0) : null,
            licensesActivated: withCounts ? (c ? c.activated : 0) : null,
          };
        }),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Partner directory error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
