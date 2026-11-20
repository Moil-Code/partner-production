// PP-LICENSE-2: the CSV import through the outbox. What a person receives must
// not change: the activation ("register") email to every licence the main API
// did not answer 'activated', and no activation at all without plan defaults.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLicenseHandlers } from '../../lib/outbox/licenseHandlers.ts';
import { makeLicenseImportHandlers, withImportHandlers, ACTIVATION_FAILED } from '../../lib/outbox/licenseImportHandlers.ts';
import {
  IMPORT_RPC_MAX,
  importRpcRows,
  issueImportLicensesViaOutbox,
  licenseImportConfig,
  planImport,
} from '../../lib/outbox/licenseImport.ts';
import { drainOnce } from '../../lib/outbox/drain.ts';
import { decideSender } from '../../lib/outbox/rules.ts';
import { memoryStore, drainOpts } from './memoryStore.mjs';

const LID = '22222222-2222-4222-8222-222222222222';
const PLAN = { plan: 'standard', billingCycle: 'yearly' };

function world({ answer = { email: 'founder@example.com', license_status: 'pending_invite', has_account: true }, apiStatus = 200, configured = true } = {}) {
  const licenses = new Map([[LID, {
    id: LID, email: 'founder@example.com', admin_id: 'admin-1', plan_tier: 'standard', billing_cycle: 'yearly',
    months: null, is_activated: false, email_status: 'pending', moil_license_status: null, moil_has_account: null,
  }]]);
  const w = { licenses, apiCalls: [], sends: [], resendKeys: new Map(), delivered: 0, recorded: [], apiStatus, answer, configured, resendFails: null, throwOnCall: false };
  const deps = {
    async getLicense(id) { const l = licenses.get(id); return l ? { ...l } : null; },
    async updateLicense(id, patch) { Object.assign(licenses.get(id), patch); },
    async markActivated(id, at) { const l = licenses.get(id); if (!l.is_activated) Object.assign(l, { is_activated: true, activated_at: at }); },
    async callActivate(body) {
      w.apiCalls.push(body);
      if (w.throwOnCall) throw new Error('socket hang up');
      if (!w.configured) return null;
      return { status: w.apiStatus, json: { data: { results: [w.answer] } } };
    },
    async getImportIssuer() { return { orgSlug: 'Buda-EDC', adminName: 'Ana B', adminEmail: 'ana@partner.example', edc: undefined }; },
    async sendImportEmail(a) {
      w.sends.push(a);
      if (w.resendFails) return { success: false, errorName: w.resendFails };
      if (!w.resendKeys.has(a.idempotencyKey)) { w.resendKeys.set(a.idempotencyKey, `msg-${w.resendKeys.size + 1}`); w.delivered += 1; }
      return { success: true, messageId: w.resendKeys.get(a.idempotencyKey) };
    },
    async recordEmail(s) { w.recorded.push(s); },
    appUrl: 'https://business.example',
    now: () => '2026-11-20T00:00:00.000Z',
  };
  const add = makeLicenseHandlers({ ...deps, getIssuer: async () => ({}), sendEmail: async () => { throw new Error('add email must not run'); } });
  return { w, deps, handlers: withImportHandlers(add, deps) };
}

/** What issue_import_licenses emits for one row (mirrors the SQL). */
function emitImport(store, { sender, needsActivation, expectsEmail = true, id = LID }) {
  if (needsActivation) {
    store.emit({ event_type: 'license.activate', aggregate_id: id, ordering_key: `license:${id}`, idempotency_key: `license.activate:${id}`,
      payload: { license_id: id, sender, flow: 'import', expects_email: expectsEmail, plan: 'standard', billing_cycle: 'yearly', months: null } });
  }
  store.emit({ event_type: 'license.import_email', aggregate_id: id, ordering_key: `license:${id}`, idempotency_key: `license.import_email:${id}`,
    payload: { license_id: id, sender, needs_activation: needsActivation, expects_email: expectsEmail } });
}

async function drainQuiet(store, handlers, passes = 5) {
  for (let i = 0; i < passes; i += 1) {
    await drainOnce(store, handlers, drainOpts(`r${i}`));
    store.advance(10 ** 9);
  }
}

// ---------- config and planning ----------

test('config: shadow by default, canary 0; its own dial, apart from /add', () => {
  assert.deepEqual(licenseImportConfig({}), { mode: 'shadow', canary: 0 });
  assert.deepEqual(licenseImportConfig({ LICENSE_ISSUE_OUTBOX: 'on', LICENSE_ISSUE_OUTBOX_CANARY: '100' }), { mode: 'shadow', canary: 0 });
  assert.deepEqual(licenseImportConfig({ LICENSE_IMPORT_OUTBOX: 'on', LICENSE_IMPORT_OUTBOX_CANARY: '25' }), { mode: 'on', canary: 25 });
  assert.deepEqual(licenseImportConfig({ LICENSE_IMPORT_OUTBOX: 'maybe' }), { mode: 'off', canary: 0 });
});

test('plan: off, empty and oversize imports stay inline (all legacy); shadow is all legacy through the RPC', () => {
  let n = 0;
  const id = () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`;
  const emails = ['a@x.co', 'b@x.co', 'c@x.co'];
  const off = planImport(emails, { mode: 'off', canary: 100 }, id);
  assert.equal(off.useRpc, false);
  assert.ok(off.items.every((i) => i.sender === 'legacy'));
  assert.equal(planImport([], { mode: 'on', canary: 100 }, id).useRpc, false);
  const big = planImport(Array.from({ length: IMPORT_RPC_MAX + 1 }, (_, i) => `p${i}@x.co`), { mode: 'on', canary: 100 }, id);
  assert.equal(big.useRpc, false);
  assert.ok(big.items.every((i) => i.sender === 'legacy'));
  const shadow = planImport(emails, { mode: 'shadow', canary: 100 }, id);
  assert.equal(shadow.useRpc, true);
  assert.ok(shadow.items.every((i) => i.sender === 'legacy'));
  const on = planImport(emails, { mode: 'on', canary: 100 }, id);
  assert.ok(on.items.every((i) => i.sender === 'outbox'));
  assert.equal(new Set(on.items.map((i) => i.id)).size, 3, 'one id per licence');
});

test('rows: legacy carries the inline answer; outbox carries only the plan; no plan = no activation', () => {
  const items = [{ id: 'l1', email: 'A@x.co', sender: 'legacy' }, { id: 'o1', email: 'B@x.co', sender: 'outbox' }];
  const inline = () => ({ isActivated: true, expectsEmail: false, planTier: 'market_pro', billingCycle: 'yearly', moilUserId: 'u1', expiresAt: '2027-01-01T00:00:00Z' });
  const [l, o] = importRpcRows(items, PLAN, inline);
  assert.deepEqual(l, { id: 'l1', email: 'a@x.co', sender: 'legacy', needs_activation: true, months: null, expects_email: false, is_activated: true, plan_tier: 'market_pro', billing_cycle: 'yearly', moil_user_id: 'u1', expires_at: '2027-01-01T00:00:00Z' });
  assert.deepEqual(o, { id: 'o1', email: 'b@x.co', sender: 'outbox', needs_activation: true, months: null, expects_email: true, is_activated: false, plan_tier: 'standard', billing_cycle: 'yearly', moil_user_id: null, expires_at: null });
  const [noPlan] = importRpcRows([items[1]], null, inline);
  assert.equal(noPlan.needs_activation, false);
  assert.equal(noPlan.plan_tier, null);
});

test('inert: the import RPC not installed -> unavailable (the route inserts inline); it calls issue_import_licenses', async () => {
  let called;
  const admin = { rpc: async (fn) => { called = fn; return { data: null, error: { code: 'PGRST202' } }; } };
  const r = await issueImportLicensesViaOutbox(admin, { adminId: 'a', teamId: null, partnerId: null, rows: [] });
  assert.deepEqual(r, { status: 'unavailable' });
  assert.equal(called, 'issue_import_licenses');
});

// ---------- the drain sends exactly today's email ----------

test('partner import (no plan): no activation, one activation email, keyed, with the register link', async () => {
  const s = memoryStore();
  const { w, handlers } = world();
  emitImport(s, { sender: 'outbox', needsActivation: false });
  await drainQuiet(s, handlers);
  assert.equal(w.apiCalls.length, 0, 'the partner CSV import never activates');
  assert.equal(w.delivered, 1);
  const sent = w.sends[0];
  assert.equal(sent.idempotencyKey, `license.import_email:${LID}`);
  assert.equal(sent.activationUrl, `https://business.example/register?licenseId=${LID}&ref=moilPartners&org=Buda-EDC`);
  assert.equal(sent.adminName, 'Ana B');
  assert.equal(sent.adminEmail, 'ana@partner.example');
  assert.equal(w.licenses.get(LID).email_status, 'sent');
  assert.deepEqual(w.recorded.map((r) => r.kind), ['activation']);
  assert.ok(s.rows.every((r) => r.status === 'delivered'));
});

test('plan import: the same request as the route, and the activation email for every answer but activated', async () => {
  for (const [answer, emailed, activated] of [
    [{ email: 'founder@example.com', license_status: 'pending_invite', has_account: true }, true, false], // has an account: still the register email, as today
    [{ email: 'founder@example.com', license_status: 'pending_invite', has_account: false }, true, false],
    [{ email: 'founder@example.com', license_status: 'already_assigned' }, true, false],
    [{ email: 'founder@example.com', license_status: 'blocked_downgrade' }, true, false],
    [{ email: 'founder@example.com', license_status: 'activated', moil_user_id: 'u9' }, false, true],
  ]) {
    const s = memoryStore();
    const { w, handlers } = world({ answer });
    emitImport(s, { sender: 'outbox', needsActivation: true });
    await drainQuiet(s, handlers);
    assert.deepEqual(w.apiCalls, [{ emails: ['founder@example.com'], defaults: PLAN }], answer.license_status);
    assert.equal(w.delivered, emailed ? 1 : 0, answer.license_status);
    const l = w.licenses.get(LID);
    assert.equal(l.is_activated, activated, answer.license_status);
    assert.equal(l.moil_license_status, answer.license_status);
    if (!emailed) assert.equal(l.email_status, 'skipped');
  }
});

test('a final activation failure still sends the email, as the route does today', async () => {
  for (const setup of [{ apiStatus: 400 }, { configured: false }]) {
    const s = memoryStore();
    const { w, handlers } = world(setup);
    emitImport(s, { sender: 'outbox', needsActivation: true });
    await drainQuiet(s, handlers);
    assert.equal(s.rows.find((r) => r.event_type === 'license.activate').status, 'dead', JSON.stringify(setup));
    assert.equal(w.licenses.get(LID).moil_license_status, ACTIVATION_FAILED);
    assert.equal(w.licenses.get(LID).is_activated, false);
    assert.equal(w.delivered, 1, JSON.stringify(setup));
  }
});

test('a transient failure is retried (email waits); on the last attempt it gives up and the email goes', async () => {
  const s = memoryStore();
  const { w, handlers } = world({ apiStatus: 503 });
  emitImport(s, { sender: 'outbox', needsActivation: true });
  await drainQuiet(s, handlers, 3);
  assert.equal(w.sends.length, 0);
  assert.equal(s.rows.find((r) => r.event_type === 'license.import_email').attempts, 0, 'email never claimed while activation pending');
  await drainQuiet(s, handlers, 12);
  assert.equal(s.rows.find((r) => r.event_type === 'license.activate').attempts, 10);
  assert.equal(w.licenses.get(LID).moil_license_status, ACTIVATION_FAILED);
  assert.equal(w.delivered, 1);
});

test('a thrown call retries; recovering before the last attempt applies the plan', async () => {
  const s = memoryStore();
  const { w, handlers } = world();
  w.throwOnCall = true;
  emitImport(s, { sender: 'outbox', needsActivation: true });
  await drainQuiet(s, handlers, 2);
  assert.equal(w.sends.length, 0);
  w.throwOnCall = false;
  await drainQuiet(s, handlers, 3);
  assert.equal(w.licenses.get(LID).moil_license_status, 'pending_invite');
  assert.equal(w.delivered, 1);
});

// ---------- idempotency ----------

test('duplicate delivery -> one activation, one email', async () => {
  const { w, deps } = world();
  const h = makeLicenseImportHandlers(deps);
  const act = { event_type: 'license.activate', aggregate_id: LID, attempts: 1, payload: { license_id: LID, sender: 'outbox', flow: 'import', plan: 'standard', billing_cycle: 'yearly' } };
  const mail = { event_type: 'license.import_email', aggregate_id: LID, attempts: 1, payload: { license_id: LID, sender: 'outbox', needs_activation: true } };
  await h.activate(act, 'k-a');
  await h.activate(act, 'k-a');
  await h.email(mail, 'k-e');
  await h.email(mail, 'k-e');
  assert.equal(w.apiCalls.length, 1);
  assert.equal(w.sends.length, 1);
});

test('crash after the send and before the row update: redelivered, Resend dedupes on the key', async () => {
  const { w, deps } = world();
  const h = makeLicenseImportHandlers(deps);
  const mail = { event_type: 'license.import_email', aggregate_id: LID, attempts: 1, payload: { license_id: LID, sender: 'outbox', needs_activation: false } };
  await h.email(mail, `license.import_email:${LID}`);
  w.licenses.get(LID).email_status = 'pending'; // the process died before the update landed
  await h.email(mail, `license.import_email:${LID}`);
  assert.equal(w.sends.length, 2);
  assert.equal(w.delivered, 1);
});

test('Resend validation error is dead at once; a rate limit retries', async () => {
  const { w, deps } = world();
  const h = makeLicenseImportHandlers(deps);
  const mail = { event_type: 'license.import_email', aggregate_id: LID, attempts: 1, payload: { license_id: LID, sender: 'outbox', needs_activation: false } };
  w.resendFails = 'validation_error';
  assert.equal((await h.email(mail, 'k')).outcome, 'dead');
  w.resendFails = 'rate_limit_exceeded';
  assert.equal((await h.email(mail, 'k')).outcome, 'retry');
});

// ---------- shadow and the canary boundary ----------

test('legacy sender (shadow): never calls the main API or Resend; waits for the route, or not at all when it sent no email', async () => {
  const s = memoryStore();
  const { w, handlers } = world();
  emitImport(s, { sender: 'legacy', needsActivation: true, expectsEmail: true });
  await drainOnce(s, handlers, drainOpts('a'));
  assert.equal(s.rows[0].status, 'pending', 'route has not written email_status yet');
  w.licenses.get(LID).email_status = 'sent';
  await drainQuiet(s, handlers, 3);
  assert.ok(s.rows.every((r) => r.status === 'delivered'));

  const s2 = memoryStore();
  const two = world();
  emitImport(s2, { sender: 'legacy', needsActivation: true, expectsEmail: false }); // the route answered 'activated' and emailed nobody
  const c = await drainOnce(s2, two.handlers, drainOpts('b'));
  s2.advance(10 ** 9);
  const c2 = await drainOnce(s2, two.handlers, drainOpts('c'));
  assert.equal(c.shadowVerified + c2.shadowVerified, 2);
  assert.equal(two.w.licenses.get(LID).email_status, 'pending', 'nothing written');
  for (const x of [w, two.w]) {
    assert.equal(x.apiCalls.length, 0);
    assert.equal(x.sends.length, 0);
  }
});

test('canary boundary: for every licence exactly one of route and drain sends', async () => {
  const ids = Array.from({ length: 200 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
  for (const canary of [0, 10, 50, 100]) {
    const plan = planImport(ids.map((_, i) => `p${i}@x.co`), { mode: 'on', canary }, (() => { let i = 0; return () => ids[i++]; })());
    for (const item of plan.items) {
      assert.equal(item.sender, decideSender('on', canary, item.id));
      const routeSends = item.sender === 'legacy'; // import/route.ts emails only licences not in outboxIds
      const { w, handlers } = world();
      w.licenses.set(item.id, { ...w.licenses.get(LID), id: item.id });
      if (routeSends) w.licenses.get(item.id).email_status = 'sent';
      const ev = (type, payload) => ({ event_type: type, aggregate_id: item.id, attempts: 1, payload: { license_id: item.id, sender: item.sender, ...payload } });
      await handlers['license.activate'](ev('license.activate', { flow: 'import', plan: 'standard', billing_cycle: 'yearly', expects_email: true }), 'a');
      await handlers['license.import_email'](ev('license.import_email', { needs_activation: true, expects_email: true }), 'e');
      const drainSends = w.apiCalls.length + w.sends.length > 0;
      assert.notEqual(routeSends, drainSends, `id ${item.id} at canary ${canary}`);
    }
  }
});

test('dispatch: an /add activation (no flow) still runs the /add handler, with its own request', async () => {
  const calls = [];
  const fake = (tag) => async () => { calls.push(tag); return { outcome: 'delivered' }; };
  const addEmail = fake('add-email');
  const h = withImportHandlers({ 'license.activate': fake('add'), 'license.email': addEmail }, world().deps);
  await h['license.activate']({ payload: { sender: 'legacy' } }, 'k');
  assert.deepEqual(calls, ['add']);
  assert.equal(h['license.email'], addEmail, '/add email handler untouched');
  assert.equal(typeof h['license.import_email'], 'function');
});
