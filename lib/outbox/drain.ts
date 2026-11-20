/**
 * One bounded drain pass: claim due rows in small chunks, run their handlers
 * (a chunk in parallel), settle each one, stop at the row bound or the time
 * budget. Dependencies are injected, so this file imports no runtime module
 * and tests run it against fakes (tests/outbox/drain.test.mjs).
 *
 * The partner app runs on Vercel with no long-lived process, so there is no
 * loop here: the VPS cron calls POST /api/outbox/drain every minute and each
 * call is one pass. A pass never claims more than it can finish inside the
 * budget, because a claimed row nobody settles waits a whole lease.
 */

import type { Outcome } from './rules.ts';

export interface OutboxRow {
  id: string;
  event_type: string;
  event_version: number;
  aggregate_type: string;
  aggregate_id: string;
  ordering_key: string | null;
  payload: Record<string, unknown>;
  idempotency_key: string;
  attempts: number;
  created_at: string;
}

export interface HandlerResult {
  outcome: Outcome;
  error?: string;
  /** Shadow mode: the legacy path did the effect; the outbox only verified. */
  shadow?: boolean;
  /** Shadow mode: the legacy path got there but recorded a failure. */
  legacyFailed?: boolean;
}

export type Handler = (event: OutboxRow, idempotencyKey: string) => Promise<HandlerResult>;

export interface HealthRow {
  event_type: string;
  pending: number;
  oldest_pending_seconds: number;
  dead: number;
  delivered_last_hour: number;
}

export interface OutboxStore {
  /** null = the outbox is not installed (migration not applied). */
  claim(relayId: string, batch: number, leaseSeconds: number): Promise<OutboxRow[] | null>;
  /** The row's new status, 'not_holder', or null when the call failed. */
  settle(id: string, relayId: string, outcome: Outcome, error?: string): Promise<string | null>;
  health(): Promise<HealthRow[] | null>;
}

export interface DrainOptions {
  relayId: string;
  batch: number;
  chunk: number;
  leaseSeconds: number;
  budgetMs: number;
  handlerTimeoutMs: number;
  now?: () => number;
  sanitize?: (err: unknown) => string;
}

export interface DrainCounts {
  available: boolean;
  claimed: number;
  delivered: number;
  retried: number;
  dead: number;
  shadowVerified: number;
  shadowLegacyFailed: number;
  settleFailed: number;
  /** The claim call failed (database unreachable): nothing was leased. */
  claimFailed: boolean;
  notHolder: number;
  pending: number | null;
  oldestPendingSeconds: number | null;
  deadTotal: number | null;
  byType: HealthRow[];
  durationMs: number;
}

function timeout<T>(ms: number, p: Promise<T>): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timer = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(new Error(`handler timed out after ${ms} ms`)), ms);
  });
  return Promise.race([p, timer]).finally(() => {
    if (t) clearTimeout(t);
  });
}

export async function drainOnce(
  store: OutboxStore,
  handlers: Record<string, Handler>,
  opts: DrainOptions,
): Promise<DrainCounts> {
  const now = opts.now ?? Date.now;
  const sanitize = opts.sanitize ?? ((e: unknown) => String(e).slice(0, 500));
  const started = now();
  const counts: DrainCounts = {
    available: true,
    claimed: 0,
    delivered: 0,
    retried: 0,
    dead: 0,
    shadowVerified: 0,
    shadowLegacyFailed: 0,
    settleFailed: 0,
    claimFailed: false,
    notHolder: 0,
    pending: null,
    oldestPendingSeconds: null,
    deadTotal: null,
    byType: [],
    durationMs: 0,
  };

  const runOne = async (row: OutboxRow) => {
    const handler = handlers[row.event_type];
    let result: HandlerResult;
    if (!handler) {
      result = { outcome: 'dead', error: `unknown event type ${row.event_type}` };
    } else {
      try {
        result = await timeout(opts.handlerTimeoutMs, handler(row, row.idempotency_key));
      } catch (err) {
        // Includes a timeout: the call may still land. The consumer dedupes on
        // the idempotency key, so the redelivery is safe.
        result = { outcome: 'retry', error: sanitize(err) };
      }
    }

    let status: string | null;
    try {
      status = await store.settle(row.id, opts.relayId, result.outcome, result.error);
    } catch {
      status = null;
    }
    if (status === null) {
      // The lease runs out and another pass re-claims the row; the handler is
      // idempotent on the key, so the effect is not repeated.
      counts.settleFailed += 1;
      return;
    }
    if (status === 'not_holder') {
      counts.notHolder += 1;
      return;
    }
    if (status === 'delivered') {
      counts.delivered += 1;
      if (result.shadow) counts.shadowVerified += 1;
      if (result.legacyFailed) counts.shadowLegacyFailed += 1;
    } else if (status === 'dead') counts.dead += 1;
    else counts.retried += 1;
  };

  while (counts.claimed < opts.batch && now() - started < opts.budgetMs) {
    const want = Math.min(opts.chunk, opts.batch - counts.claimed);
    let rows: OutboxRow[] | null;
    try {
      rows = await store.claim(opts.relayId, want, opts.leaseSeconds);
    } catch {
      // A failed claim leases nothing; the next pass tries again.
      counts.claimFailed = true;
      break;
    }
    if (rows === null) {
      counts.available = false;
      break;
    }
    if (rows.length === 0) break;
    counts.claimed += rows.length;
    await Promise.all(rows.map(runOne));
  }

  if (counts.available) {
    let health: HealthRow[] | null = null;
    try {
      health = await store.health();
    } catch {
      health = null;
    }
    if (health) {
      counts.byType = health;
      counts.pending = health.reduce((n, h) => n + Number(h.pending || 0), 0);
      counts.deadTotal = health.reduce((n, h) => n + Number(h.dead || 0), 0);
      counts.oldestPendingSeconds = health.reduce(
        (m, h) => (Number(h.pending) > 0 ? Math.max(m, Number(h.oldest_pending_seconds || 0)) : m),
        0,
      );
    }
  }

  counts.durationMs = now() - started;
  return counts;
}
