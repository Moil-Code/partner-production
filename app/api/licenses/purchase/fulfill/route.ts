import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import {
  internalApiKey,
  providedApiKey,
  notConfiguredBody,
  unauthorizedBody,
} from '@/lib/internalApiKey';

/**
 * POST /api/licenses/purchase/fulfill — add purchased seats, called by the
 * main API's Stripe webhook once a license Checkout session is PAID.
 *
 * Body: { sessionId: string, adminId: uuid, teamId: uuid | null, licenseCount: int }
 *
 * Answers (the webhook's contract):
 *   200 { applied: true }                              seats added now
 *   200 { applied: false, reason: 'already_fulfilled' } a redelivery; nothing added
 *   400 bad body / 404 unknown team or admin           permanent, not retried
 *   401 wrong key / 503 key or SQL not configured      the webhook retries
 *
 * Idempotency and races: everything happens in ONE SQL function
 * (database/add_license_purchase_fulfillment.sql) — the session id is the
 * primary key of license_purchases, and the count is added with a single
 * UPDATE only when that insert happened, so two deliveries at once add once.
 *
 * Auth: the shared internal key (lib/internalApiKey.ts), failing closed. It is
 * on the middleware allowlist because it carries no session.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const expectedKey = internalApiKey();
  if (!expectedKey) {
    console.error('[licenses/purchase/fulfill] no internal API key configured — refusing all requests.');
    return NextResponse.json(notConfiguredBody('Purchase fulfilment endpoint'), { status: 503 });
  }
  const presentedKey = providedApiKey(request);
  if (presentedKey !== expectedKey) {
    return NextResponse.json(unauthorizedBody(expectedKey, presentedKey), { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const sessionId = body?.sessionId;
  const adminId = body?.adminId;
  const teamId = body?.teamId ?? null;
  const licenseCount = body?.licenseCount;

  if (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId.length > 255) {
    return NextResponse.json({ error: '`sessionId` must be a non-empty string' }, { status: 400 });
  }
  if (typeof adminId !== 'string' || !UUID_RE.test(adminId)) {
    return NextResponse.json({ error: '`adminId` must be a UUID' }, { status: 400 });
  }
  if (teamId !== null && (typeof teamId !== 'string' || !UUID_RE.test(teamId))) {
    return NextResponse.json({ error: '`teamId` must be a UUID or null' }, { status: 400 });
  }
  if (!Number.isInteger(licenseCount) || licenseCount < 1 || licenseCount > 10000) {
    return NextResponse.json({ error: '`licenseCount` must be an integer from 1 to 10000' }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc('fulfill_license_purchase', {
      p_session_id: sessionId,
      p_admin_id: adminId,
      p_team_id: teamId,
      p_count: licenseCount,
    });

    if (error) {
      if (error.code === 'P0002') {
        console.error(`[licenses/purchase/fulfill] target not found for session ${sessionId}`);
        return NextResponse.json({ error: 'Team or admin not found' }, { status: 404 });
      }
      if (error.code === '22023') {
        return NextResponse.json({ error: 'Invalid purchase' }, { status: 400 });
      }
      // Includes a missing function (SQL not applied yet): transient, so the
      // webhook keeps retrying and nothing is lost.
      console.error(`[licenses/purchase/fulfill] rpc failed for session ${sessionId}:`, error.code, error.message);
      return NextResponse.json({ error: 'Fulfilment is temporarily unavailable' }, { status: 503 });
    }

    if (data !== true) {
      return NextResponse.json({ applied: false, reason: 'already_fulfilled' }, { status: 200 });
    }

    // Best effort: the seats are in; a missing activity row must not make the
    // webhook retry (the retry would answer already_fulfilled anyway).
    try {
      await supabase.rpc('log_activity', {
        p_team_id: teamId,
        p_admin_id: adminId,
        p_activity_type: 'licenses_purchased',
        p_description: `Purchased ${licenseCount} license(s)`,
        p_metadata: { licenses_added: licenseCount, stripe_session_id: sessionId },
      });
    } catch (logError) {
      console.error('[licenses/purchase/fulfill] log_activity failed (non-fatal):', logError);
    }

    return NextResponse.json({ applied: true }, { status: 200 });
  } catch (error) {
    console.error('[licenses/purchase/fulfill] unexpected error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
