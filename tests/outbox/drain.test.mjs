import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drainOnce } from '../../lib/outbox/drain.ts';
import { memoryStore, drainOpts } from './memoryStore.mjs';

function seed(store, n, type = 'test.event', ordering = null) {
  for (let i = 0; i < n; i += 1) {
    store.emit({
      event_type: type,
      aggregate_id: `a${i}`,
      idempotency_key: `${type}:a${i}`,
      ordering_key: ordering ? `${ordering}:${i}` : null,
    });
  }
}

test('emit is idempotent: the same key twice is one row', () => {
  const s = memoryStore();
  assert.equal(s.emit({ event_type: 'x', aggregate_id: '1', idempotency_key: 'x:1' }), true);
  assert.equal(s.emit({ event_type: 'x', aggregate_id: '1', idempotency_key: 'x:1' }), false);
  assert.equal(s.rows.length, 1);
});

test('two concurrent claimers take disjoint rows', async () => {
  const s = memoryStore();
  seed(s, 8);
  const [a, b] = await Promise.all([s.claim('A', 5, 60), s.claim('B', 5, 60)]);
  const ids = new Set([...a, ...b].map((r) => r.id));
  assert.equal(ids.size, a.length + b.length);
  assert.equal(a.length + b.length, 8);
});

test('an expired lease is claimed again by another relay; the old holder can no longer settle', async () => {
  const s = memoryStore();
  seed(s, 1);
  const [r] = await s.claim('A', 1, 60);
  assert.deepEqual(await s.claim('B', 1, 60), []);
  s.advance(61_000);
  const [again] = await s.claim('B', 1, 60);
  assert.equal(again.id, r.id);
  assert.equal(again.attempts, 2);
  assert.equal(await s.settle(r.id, 'A', 'delivered'), 'not_holder');
  assert.equal(await s.settle(r.id, 'B', 'delivered'), 'delivered');
});

test('ordering key: a later row waits while an earlier one is pending', async () => {
  const s = memoryStore();
  s.emit({ event_type: 'license.activate', aggregate_id: 'L', idempotency_key: 'a:L', ordering_key: 'license:L' });
  s.emit({ event_type: 'license.email', aggregate_id: 'L', idempotency_key: 'e:L', ordering_key: 'license:L' });
  const first = await s.claim('A', 10, 60);
  assert.deepEqual(first.map((r) => r.event_type), ['license.activate']);
  await s.settle(first[0].id, 'A', 'retry', 'down');
  s.advance(11_000);
  // Still pending (retrying): the email still waits.
  const second = await s.claim('A', 10, 60);
  assert.deepEqual(second.map((r) => r.event_type), ['license.activate']);
  await s.settle(second[0].id, 'A', 'delivered');
  const third = await s.claim('A', 10, 60);
  assert.deepEqual(third.map((r) => r.event_type), ['license.email']);
});

test('retry backs off and becomes dead after the maximum attempts', async () => {
  const s = memoryStore({ maxAttempts: 3 });
  seed(s, 1);
  for (let i = 0; i < 3; i += 1) {
    const [r] = await s.claim('A', 1, 60);
    const st = await s.settle(r.id, 'A', 'retry', 'boom');
    if (st === 'dead') break;
    // Not due yet, then due once the backoff has passed.
    assert.deepEqual(await s.claim('A', 1, 60), []);
    s.advance(10 ** 9);
  }
  assert.equal(s.rows[0].status, 'dead');
  assert.equal(s.rows[0].attempts, 3);
});

test('drain: delivered, retried, dead (non-retryable at once), unknown type dead', async () => {
  const s = memoryStore();
  seed(s, 2, 'ok.event');
  seed(s, 1, 'flaky.event');
  seed(s, 1, 'bad.event');
  seed(s, 1, 'nobody.handles.this');
  const handlers = {
    'ok.event': async () => ({ outcome: 'delivered' }),
    'flaky.event': async () => {
      throw new Error('ECONNRESET');
    },
    'bad.event': async () => ({ outcome: 'dead', error: 'validation' }),
  };
  const c = await drainOnce(s, handlers, drainOpts());
  assert.equal(c.claimed, 5);
  assert.equal(c.delivered, 2);
  assert.equal(c.retried, 1);
  assert.equal(c.dead, 2);
  const bad = s.rows.find((r) => r.event_type === 'bad.event');
  assert.equal(bad.status, 'dead');
  assert.equal(bad.attempts, 1, 'non-retryable is dead on the first attempt');
  assert.equal(c.pending, 1);
});

test('drain: bounded to the batch, in chunks', async () => {
  const s = memoryStore();
  seed(s, 50, 'ok.event');
  const c = await drainOnce(s, { 'ok.event': async () => ({ outcome: 'delivered' }) }, drainOpts());
  assert.equal(c.claimed, 20);
  assert.equal(s.calls.claim, 4);
  assert.equal(c.pending, 30);
});

test('drain: stops claiming once the time budget is spent', async () => {
  const s = memoryStore();
  seed(s, 50, 'ok.event');
  let t = 0;
  const handlers = {
    'ok.event': async () => {
      t += 3000;
      return { outcome: 'delivered' };
    },
  };
  const c = await drainOnce(s, handlers, drainOpts('r', { budgetMs: 10_000, now: () => t }));
  assert.ok(c.claimed < 20, `claimed ${c.claimed}`);
  assert.equal(c.delivered, c.claimed, 'everything claimed was finished');
});

test('drain: a handler that hangs is retried, not lost', async () => {
  const s = memoryStore();
  seed(s, 1, 'slow.event');
  const c = await drainOnce(
    s,
    { 'slow.event': () => new Promise(() => {}) },
    drainOpts('r', { handlerTimeoutMs: 20 }),
  );
  assert.equal(c.retried, 1);
  assert.match(s.rows[0].last_error, /timed out/);
});

test('drain: migration absent -> inert, nothing claimed, no throw', async () => {
  const s = memoryStore();
  s.installed = false;
  const c = await drainOnce(s, {}, drainOpts());
  assert.equal(c.available, false);
  assert.equal(c.claimed, 0);
  assert.equal(c.pending, null);
});

test('crash after the consumer call and before settle: redelivered, the consumer dedupes', async () => {
  const s = memoryStore();
  seed(s, 1, 'mail.event');
  const sentKeys = new Set();
  let effects = 0;
  const handlers = {
    'mail.event': async (_e, key) => {
      if (!sentKeys.has(key)) {
        sentKeys.add(key);
        effects += 1;
      }
      return { outcome: 'delivered' };
    },
  };
  s.failSettleOnce = true;
  const c1 = await drainOnce(s, handlers, drainOpts('A'));
  assert.equal(c1.settleFailed, 1);
  assert.equal(s.rows[0].status, 'pending');
  // Lease runs out; the next pass takes it again.
  s.advance(61_000);
  const c2 = await drainOnce(s, handlers, drainOpts('B'));
  assert.equal(c2.delivered, 1);
  assert.equal(s.rows[0].status, 'delivered');
  assert.equal(effects, 1, 'one effect for two deliveries');
});
