// Migration absent -> inert: the add routes keep inserting inline and the
// drain claims nothing; nothing throws into a request.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueLicensesViaOutbox, licenseIssueConfig } from '../../lib/outbox/licenseIssue.ts';
import { supabaseOutboxStore } from '../../lib/outbox/store.ts';
import { drainOnce } from '../../lib/outbox/drain.ts';

const rpcAnswering = (answer) => ({
  rpc: async () => answer,
});
const rows = [{ id: 'x', email: 'a@b.co', plan_tier: 'standard', billing_cycle: 'yearly', months: null, sender: 'legacy' }];
const args = { adminId: 'a', teamId: null, partnerId: null, rows };

test('issue: function not installed -> unavailable (route inserts inline)', async () => {
  for (const code of ['PGRST202', '42883', '42P01']) {
    const r = await issueLicensesViaOutbox(rpcAnswering({ data: null, error: { code } }), args);
    assert.deepEqual(r, { status: 'unavailable' }, code);
  }
});

test('issue: a refused statement wrote nothing -> rpc_failed (route inserts inline)', async () => {
  for (const code of ['22023', '23505', 'PGRST116']) {
    const r = await issueLicensesViaOutbox(rpcAnswering({ data: null, error: { code } }), args);
    assert.deepEqual(r, { status: 'rpc_failed' }, code);
  }
});

test('issue: an unknown outcome (no SQLSTATE, or a throw) -> error, never a second insert', async () => {
  assert.deepEqual(await issueLicensesViaOutbox(rpcAnswering({ data: null, error: { code: '', message: 'fetch failed' } }), args), { status: 'error' });
  const throwing = { rpc: async () => { throw new Error('socket hang up'); } };
  assert.deepEqual(await issueLicensesViaOutbox(throwing, args), { status: 'error' });
  assert.deepEqual(await issueLicensesViaOutbox(rpcAnswering({ data: { status: 'what' }, error: null }), args), { status: 'error' });
});

test('issue: ok, no_seats and exists pass through', async () => {
  const lic = { id: 'x', email: 'a@b.co', created_at: 't', is_activated: false };
  assert.deepEqual(await issueLicensesViaOutbox(rpcAnswering({ data: { status: 'ok', licenses: [lic] }, error: null }), args), { status: 'ok', licenses: [lic] });
  assert.deepEqual(await issueLicensesViaOutbox(rpcAnswering({ data: { status: 'no_seats', available: 0 }, error: null }), args), { status: 'no_seats', available: 0 });
  assert.deepEqual(await issueLicensesViaOutbox(rpcAnswering({ data: { status: 'exists', emails: ['a@b.co'] }, error: null }), args), { status: 'exists', emails: ['a@b.co'] });
});

test('config: shadow by default, canary 0; junk mode is off', () => {
  assert.deepEqual(licenseIssueConfig({}), { mode: 'shadow', canary: 0 });
  assert.deepEqual(licenseIssueConfig({ LICENSE_ISSUE_OUTBOX: 'on', LICENSE_ISSUE_OUTBOX_CANARY: '10' }), { mode: 'on', canary: 10 });
  assert.deepEqual(licenseIssueConfig({ LICENSE_ISSUE_OUTBOX: 'yes' }), { mode: 'off', canary: 0 });
});

test('drain over a store whose functions are missing: available=false, no throw', async () => {
  const store = supabaseOutboxStore(rpcAnswering({ data: null, error: { code: 'PGRST202' } }));
  assert.equal(await store.claim('r', 5, 60), null);
  assert.equal(await store.health(), null);
  const c = await drainOnce(store, {}, { relayId: 'r', batch: 20, chunk: 5, leaseSeconds: 60, budgetMs: 1000, handlerTimeoutMs: 100 });
  assert.equal(c.available, false);
  assert.equal(c.claimed, 0);
});

test('drain over a store whose claim errors otherwise: stops the pass, no throw', async () => {
  const store = supabaseOutboxStore(rpcAnswering({ data: null, error: { code: '57014' } }));
  const c = await drainOnce(store, {}, { relayId: 'r', batch: 20, chunk: 5, leaseSeconds: 60, budgetMs: 1000, handlerTimeoutMs: 100 });
  assert.equal(c.claimed, 0);
  assert.equal(c.claimFailed, true);
});
