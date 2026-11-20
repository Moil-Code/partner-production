// In-memory model of database/add_outbox.sql (emit, claim, settle, health),
// used by the offline tests. It follows the SQL rule for rule, so the drain and
// the handlers can be exercised without a database; the SQL itself is checked
// against a real Postgres by sql.test.mjs when OUTBOX_TEST_PG_URL is set.

import { randomUUID } from 'node:crypto';

export function memoryStore({ maxAttempts = 10, clock } = {}) {
  let t = 0;
  const now = clock ?? (() => t);
  const rows = [];
  let seq = 0;
  const calls = { claim: 0, settle: 0 };

  const store = {
    rows,
    calls,
    advance(ms) {
      t += ms;
    },
    installed: true,
    failSettleOnce: false,

    emit({ event_type, aggregate_id, payload = {}, idempotency_key, ordering_key = null }) {
      if (rows.some((r) => r.idempotency_key === idempotency_key)) return false;
      seq += 1;
      rows.push({
        id: randomUUID(),
        seq,
        event_type,
        event_version: 1,
        aggregate_type: 'license',
        aggregate_id,
        ordering_key,
        payload,
        idempotency_key,
        status: 'pending',
        attempts: 0,
        next_attempt_at: now(),
        locked_by: null,
        locked_until: null,
        last_error: null,
        created_at: new Date(0).toISOString(),
        delivered_at: null,
      });
      return true;
    },

    async claim(relay, batch, leaseSeconds) {
      calls.claim += 1;
      if (!store.installed) return null;
      const n = now();
      const due = rows
        .filter(
          (e) =>
            e.status === 'pending' &&
            e.next_attempt_at <= n &&
            (e.locked_until === null || e.locked_until < n) &&
            (e.ordering_key === null ||
              !rows.some(
                (o) => o.ordering_key === e.ordering_key && o.status === 'pending' && o.seq < e.seq,
              )),
        )
        .sort((a, b) => a.next_attempt_at - b.next_attempt_at || a.seq - b.seq)
        .slice(0, Math.min(Math.max(batch, 1), 200));
      for (const e of due) {
        e.locked_by = relay;
        e.locked_until = n + leaseSeconds * 1000;
        e.attempts += 1;
      }
      return due.map((e) => ({ ...e }));
    },

    async settle(id, relay, outcome, error) {
      calls.settle += 1;
      if (store.failSettleOnce) {
        store.failSettleOnce = false;
        throw new Error('connection reset');
      }
      const e = rows.find((r) => r.id === id);
      if (!e || e.status !== 'pending' || e.locked_by !== relay) return 'not_holder';
      const n = now();
      if (outcome === 'delivered') {
        e.status = 'delivered';
        e.delivered_at = n;
        e.locked_until = null;
        e.last_error = null;
      } else if (outcome === 'retry') {
        e.status = e.attempts >= maxAttempts ? 'dead' : 'pending';
        e.next_attempt_at = n + Math.min(6 * 3600, 10 * 3 ** Math.max(e.attempts - 1, 0)) * 1000;
        e.locked_until = null;
        e.last_error = error ?? null;
      } else if (outcome === 'dead') {
        e.status = 'dead';
        e.locked_until = null;
        e.last_error = error ?? null;
      }
      return e.status;
    },

    async health() {
      if (!store.installed) return null;
      const byType = new Map();
      for (const e of rows) {
        const h = byType.get(e.event_type) ?? {
          event_type: e.event_type,
          pending: 0,
          oldest_pending_seconds: 0,
          dead: 0,
          delivered_last_hour: 0,
        };
        if (e.status === 'pending') h.pending += 1;
        if (e.status === 'dead') h.dead += 1;
        if (e.status === 'delivered') h.delivered_last_hour += 1;
        byType.set(e.event_type, h);
      }
      return [...byType.values()];
    },
  };
  return store;
}

export const drainOpts = (relayId = 'relay-1', extra = {}) => ({
  relayId,
  batch: 20,
  chunk: 5,
  leaseSeconds: 60,
  budgetMs: 20_000,
  handlerTimeoutMs: 1_000,
  ...extra,
});
