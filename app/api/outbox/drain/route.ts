import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createAdminClient } from '@/lib/supabase/server';
import {
  internalApiKey,
  providedApiKey,
  notConfiguredBody,
  unauthorizedBody,
} from '@/lib/internalApiKey';
import { drainOnce } from '@/lib/outbox/drain';
import { supabaseOutboxStore } from '@/lib/outbox/store';
import { makeLicenseHandlers } from '@/lib/outbox/licenseHandlers';
import { licenseDeps } from '@/lib/outbox/licenseDeps';
import {
  DRAIN_BATCH_MAX,
  DRAIN_CHUNK,
  LEASE_SECONDS,
  sanitizeError,
  switchOn,
} from '@/lib/outbox/rules';

/**
 * POST /api/outbox/drain — perform pending outbox events, one bounded pass.
 *
 * The partner app runs on Vercel and has no long-lived process, so the VPS
 * cron calls this every minute with the shared internal key (see
 * EXTERNAL_API_DOCS.md for the crontab line). Each call claims at most 20
 * rows, 5 at a time, stops claiming after OUTBOX_DRAIN_BUDGET_MS (default
 * 20 s), and gives every handler 15 s, well inside maxDuration below. A row
 * not finished in time keeps its 60 s lease and the next minute takes it.
 *
 * Answers 200 with the counts the cron pushes to the OTel collector:
 *   { enabled, available, claimed, delivered, retried, dead, shadowVerified,
 *     shadowLegacyFailed, settleFailed, claimFailed, notHolder, pending,
 *     oldestPendingSeconds, deadTotal, byType, pruned, durationMs }
 * available: false = the outbox migration is not applied (nothing to do).
 * 401 wrong key, 503 key not configured (as the other internal routes).
 *
 * Kill switch: OUTBOX_DRAIN=false answers 200 { enabled: false } and touches
 * nothing; rows wait, nothing is lost.
 *
 * On the middleware allowlist: it carries no session and authenticates itself.
 */

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const HANDLER_TIMEOUT_MS = 15_000;
const DEFAULT_BUDGET_MS = 20_000;

function budgetMs(): number {
  const n = Number(process.env.OUTBOX_DRAIN_BUDGET_MS);
  return Number.isFinite(n) && n >= 1_000 && n <= 40_000 ? n : DEFAULT_BUDGET_MS;
}

export async function POST(request: Request) {
  const expectedKey = internalApiKey();
  if (!expectedKey) {
    console.error('[outbox/drain] no internal API key configured — refusing all requests.');
    return NextResponse.json(notConfiguredBody('Outbox drain endpoint'), { status: 503 });
  }
  const presentedKey = providedApiKey(request);
  if (presentedKey !== expectedKey) {
    return NextResponse.json(unauthorizedBody(expectedKey, presentedKey), { status: 401 });
  }

  if (!switchOn(process.env.OUTBOX_DRAIN)) {
    return NextResponse.json({ enabled: false });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: 'Supabase is not configured on the partner app.' }, { status: 503 });
  }

  const store = supabaseOutboxStore(admin);
  const handlers = makeLicenseHandlers(licenseDeps(admin));
  const relayId = `partner-drain:${randomUUID()}`;

  const counts = await drainOnce(store, handlers, {
    relayId,
    batch: DRAIN_BATCH_MAX,
    chunk: DRAIN_CHUNK,
    leaseSeconds: LEASE_SECONDS,
    budgetMs: budgetMs(),
    handlerTimeoutMs: HANDLER_TIMEOUT_MS,
    sanitize: sanitizeError,
  });

  // Retention once an hour (the cron calls every minute).
  let pruned: number | null = null;
  if (counts.available && new Date().getUTCMinutes() === 0) {
    pruned = await store.prune();
  }

  // One structured line per pass: counts only, never a payload.
  console.log(
    `[outbox] drain relay=${relayId} available=${counts.available} claimed=${counts.claimed} ` +
      `delivered=${counts.delivered} retried=${counts.retried} dead=${counts.dead} ` +
      `shadow=${counts.shadowVerified} shadow_legacy_failed=${counts.shadowLegacyFailed} ` +
      `settle_failed=${counts.settleFailed} claim_failed=${counts.claimFailed} not_holder=${counts.notHolder} ` +
      `pending=${counts.pending} oldest_pending_s=${counts.oldestPendingSeconds} ` +
      `dead_total=${counts.deadTotal} ms=${counts.durationMs}`,
  );

  return NextResponse.json({ enabled: true, ...counts, pruned });
}
