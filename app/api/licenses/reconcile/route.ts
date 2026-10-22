import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  internalApiKey,
  providedApiKey,
  notConfiguredBody,
  unauthorizedBody,
} from '@/lib/internalApiKey';

/**
 * Pull-based reconciliation of seat status, called by the Moil backend.
 *
 * WHY THIS EXISTS — this app never observes a login. A seat flips to
 * Activated only when the Moil backend POSTs /activate, and that call needs a
 * licenseId, a businessName and a businessType. A licensee who signed up but
 * never finished the employer profile, whose /activate call failed once, or who
 * registered under the address on the seat, therefore stays "Pending" here
 * forever. This route lets Moil sweep its own users and tell us who is already
 * in, so those seats stop reading as unclaimed (and stop getting
 * "you haven't activated" reminders).
 *
 * Body: {
 *   items: Array<{
 *     licenseId?: string,      // preferred: exact match
 *     email?: string,          // fallback, see below
 *     moilUserId: string,      // REQUIRED — proof the person exists in Moil
 *     businessName?: string,   // optional, unlike /activate
 *     businessType?: string,
 *     activatedAt?: string,    // ISO; the user's real first-login/profile date
 *   }>,
 *   dryRun?: boolean,
 * }
 *
 * Rules:
 *   - `grant_kind = 'base'` rows only; an add-on is not a seat.
 *   - Only moves a seat Pending -> Activated. Already-activated rows are
 *     reported as `alreadyActivated`; nothing on them is changed.
 *   - `email` fallback matches case-insensitively and only when EXACTLY ONE
 *     pending base seat has that address. Zero or several are reported, never
 *     guessed at: activating the wrong seat is worse than leaving one pending.
 *   - business_name / business_type / moil_user_id are fill-if-empty.
 *   - The flip is conditioned on `is_activated = false`, so a concurrent
 *     /activate cannot be double-counted against the admin's counter.
 *
 * AUTH: shared secret, failing closed with 503 — this route can change status
 * and takes an email, so a UUID is not a sufficient capability.
 */

const MAX_ITEMS = 500;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ReconcileItem = {
  licenseId?: unknown;
  email?: unknown;
  moilUserId?: unknown;
  businessName?: unknown;
  businessType?: unknown;
  activatedAt?: unknown;
};

type SeatRow = {
  id: string;
  email: string;
  admin_id: string | null;
  grant_kind: string | null;
  is_activated: boolean;
  business_name: string | null;
  business_type: string | null;
  moil_user_id: string | null;
};

type Result = {
  index: number;
  licenseId?: string;
  status:
    | 'activated'
    | 'would_activate'
    | 'alreadyActivated'
    | 'notFound'
    | 'ambiguous'
    | 'invalid'
    | 'error';
  detail?: string;
};

const SEAT_COLUMNS =
  'id, email, admin_id, grant_kind, is_activated, business_name, business_type, moil_user_id';

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export async function POST(request: Request) {
  try {
    const expectedKey = internalApiKey();
    if (!expectedKey) {
      console.error('[licenses/reconcile] no internal API key configured — refusing all requests.');
      return NextResponse.json(notConfiguredBody('Reconcile endpoint'), { status: 503 });
    }
    const presentedKey = providedApiKey(request);
    if (presentedKey !== expectedKey) {
      return NextResponse.json(unauthorizedBody(expectedKey, presentedKey), { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const items: ReconcileItem[] | null = Array.isArray(body?.items) ? body.items : null;
    const dryRun = body?.dryRun === true;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: '`items` must be a non-empty array' }, { status: 400 });
    }
    if (items.length > MAX_ITEMS) {
      return NextResponse.json(
        { error: `At most ${MAX_ITEMS} items per request` },
        { status: 400 }
      );
    }

    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const results: Result[] = [];

    for (let index = 0; index < items.length; index++) {
      const item = items[index] ?? {};
      const licenseId = str(item.licenseId);
      const email = str(item.email).toLowerCase();
      const moilUserId = str(item.moilUserId);

      if (!moilUserId) {
        results.push({ index, status: 'invalid', detail: 'moilUserId is required' });
        continue;
      }
      if (!licenseId && !email) {
        results.push({ index, status: 'invalid', detail: 'licenseId or email is required' });
        continue;
      }
      if (licenseId && !UUID_RE.test(licenseId)) {
        results.push({ index, status: 'invalid', detail: 'licenseId is not a UUID' });
        continue;
      }

      let activatedAt = new Date().toISOString();
      const activatedAtRaw = str(item.activatedAt);
      if (activatedAtRaw) {
        const parsed = new Date(activatedAtRaw);
        if (Number.isNaN(parsed.getTime())) {
          results.push({ index, status: 'invalid', detail: 'activatedAt must be ISO 8601' });
          continue;
        }
        activatedAt = parsed.toISOString();
      }

      // Resolve the seat.
      let seat: SeatRow | null = null;
      if (licenseId) {
        const { data, error } = await supabase
          .from('licenses')
          .select(SEAT_COLUMNS)
          .eq('id', licenseId)
          .maybeSingle();
        if (error) {
          results.push({ index, licenseId, status: 'error', detail: 'lookup failed' });
          continue;
        }
        seat = data as SeatRow | null;
      } else {
        const { data, error } = await supabase
          .from('licenses')
          .select(SEAT_COLUMNS)
          .ilike('email', email.replace(/[\\%_]/g, (c) => `\\${c}`))
          .eq('is_activated', false)
          .neq('grant_kind', 'addon')
          .limit(2);
        if (error) {
          results.push({ index, status: 'error', detail: 'lookup failed' });
          continue;
        }
        if (!data || data.length === 0) {
          results.push({ index, status: 'notFound', detail: 'no pending seat for that email' });
          continue;
        }
        if (data.length > 1) {
          results.push({
            index,
            status: 'ambiguous',
            detail: 'several pending seats share that email; send licenseId',
          });
          continue;
        }
        seat = data[0] as SeatRow;
      }

      if (!seat) {
        results.push({ index, licenseId: licenseId || undefined, status: 'notFound' });
        continue;
      }
      if (seat.grant_kind === 'addon') {
        results.push({
          index,
          licenseId: seat.id,
          status: 'invalid',
          detail: 'add-on rows are not seats',
        });
        continue;
      }
      if (seat.is_activated) {
        results.push({ index, licenseId: seat.id, status: 'alreadyActivated' });
        continue;
      }
      if (dryRun) {
        results.push({ index, licenseId: seat.id, status: 'would_activate' });
        continue;
      }

      const businessName = str(item.businessName);
      const businessType = str(item.businessType);

      // `.eq('is_activated', false)` makes the flip atomic against a racing
      // /activate: only the writer that changes the row increments the counter.
      const { data: flipped, error: updateError } = await supabase
        .from('licenses')
        .update({
          is_activated: true,
          activated_at: activatedAt,
          ...(!seat.moil_user_id ? { moil_user_id: moilUserId } : {}),
          ...(!seat.business_name && businessName ? { business_name: businessName } : {}),
          ...(!seat.business_type && businessType ? { business_type: businessType } : {}),
        })
        .eq('id', seat.id)
        .eq('is_activated', false)
        .select('id');

      if (updateError) {
        console.error('[licenses/reconcile] update failed:', updateError);
        results.push({ index, licenseId: seat.id, status: 'error', detail: 'update failed' });
        continue;
      }
      if (!flipped || flipped.length === 0) {
        results.push({ index, licenseId: seat.id, status: 'alreadyActivated' });
        continue;
      }

      // Same best-effort counter bump as /activate (base seats only).
      if (seat.admin_id) {
        try {
          const { data: adminRow } = await supabase
            .from('admins')
            .select('active_purchased_license_count')
            .eq('id', seat.admin_id)
            .single();
          if (adminRow) {
            await supabase
              .from('admins')
              .update({
                active_purchased_license_count:
                  (adminRow.active_purchased_license_count || 0) + 1,
              })
              .eq('id', seat.admin_id);
          }
        } catch (countError) {
          console.error('[licenses/reconcile] admin count update failed (non-fatal):', countError);
        }
      }

      results.push({ index, licenseId: seat.id, status: 'activated' });
    }

    const summary = results.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({ success: true, dryRun, summary, results });
  } catch (error) {
    console.error('License reconcile error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
