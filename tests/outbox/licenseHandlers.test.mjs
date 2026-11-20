import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLicenseHandlers } from '../../lib/outbox/licenseHandlers.ts';
import { drainOnce } from '../../lib/outbox/drain.ts';
import { decideSender } from '../../lib/outbox/rules.ts';
import { memoryStore, drainOpts } from './memoryStore.mjs';

const LID = '11111111-1111-4111-8111-111111111111';

function fakeWorld({ moilAnswer = { license_status: 'pending_invite', has_account: false }, apiStatus = 200 } = {}) {
  const licenses = new Map();
  licenses.set(LID, {
    id: LID,
    email: 'founder@example.com',
    admin_id: 'admin-1',
    plan_tier: 'standard',
    billing_cycle: 'yearly',
    months: null,
    is_activated: false,
    email_status: 'pending',
    moil_license_status: null,
    moil_has_account: null,
  });
  const world = {
    licenses,
    apiCalls: [],
    resendKeys: new Map(), // Resend's idempotency: key -> message id
    emailsDelivered: 0,
    sends: [],
    recorded: [],
    apiStatus,
    moilAnswer,
    resendFails: null,
  };
  const deps = {
    async getLicense(id) {
      const l = licenses.get(id);
      return l ? { ...l } : null;
    },
    async getIssuer() {
      return { sourceName: 'Buda EDC', partnerName: 'Buda Program', orgSlug: 'Buda-EDC', adminName: 'Ana B', edc: {} };
    },
    async updateLicense(id, patch) {
      Object.assign(licenses.get(id), patch);
    },
    async markActivated(id, at) {
      const l = licenses.get(id);
      if (!l.is_activated) Object.assign(l, { is_activated: true, activated_at: at });
    },
    async callActivate(body) {
      world.apiCalls.push(body);
      return { status: world.apiStatus, json: { data: { results: [world.moilAnswer] } } };
    },
    async sendEmail(kind, a) {
      world.sends.push({ kind, key: a.idempotencyKey });
      if (world.resendFails) return { success: false, errorName: world.resendFails };
      if (!world.resendKeys.has(a.idempotencyKey)) {
        world.resendKeys.set(a.idempotencyKey, `msg-${world.resendKeys.size + 1}`);
        world.emailsDelivered += 1;
      }
      return { success: true, messageId: world.resendKeys.get(a.idempotencyKey) };
    },
    async recordEmail(s) {
      world.recorded.push(s);
    },
    appUrl: 'https://business.example',
    now: () => '2026-11-20T00:00:00.000Z',
  };
  return { world, handlers: makeLicenseHandlers(deps) };
}

function emitIssue(store, sender) {
  const payload = { license_id: LID, sender, plan: 'standard', billing_cycle: 'yearly', months: null };
  store.emit({ event_type: 'license.activate', aggregate_id: LID, payload, idempotency_key: `license.activate:${LID}`, ordering_key: `license:${LID}` });
  store.emit({ event_type: 'license.email', aggregate_id: LID, payload: { license_id: LID, sender }, idempotency_key: `license.email:${LID}`, ordering_key: `license:${LID}` });
}

async function drainUntilQuiet(store, handlers, passes = 5) {
  for (let i = 0; i < passes; i += 1) {
    await drainOnce(store, handlers, drainOpts(`relay-${i}`));
    store.advance(10 ** 8);
  }
}

test('outbox sender: activates once, then sends exactly the email the answer calls for, keyed', async () => {
  const s = memoryStore();
  const { world, handlers } = fakeWorld();
  emitIssue(s, 'outbox');
  await drainUntilQuiet(s, handlers);
  assert.equal(world.apiCalls.length, 1);
  assert.deepEqual(world.apiCalls[0].emails, [{ email: 'founder@example.com', licenseId: LID }]);
  assert.deepEqual(world.apiCalls[0].defaults, { plan: 'standard', billingCycle: 'yearly' });
  assert.equal(world.apiCalls[0].source, 'Buda EDC');
  assert.equal(world.emailsDelivered, 1);
  assert.deepEqual(world.sends.map((x) => x.kind), ['activation']);
  assert.equal(world.sends[0].key, `license.email:${LID}`);
  const l = world.licenses.get(LID);
  assert.equal(l.email_status, 'sent');
  assert.equal(l.moil_license_status, 'pending_invite');
  assert.equal(world.recorded.length, 1);
  assert.ok(s.rows.every((r) => r.status === 'delivered'));
});

test('no email before activation succeeded: a failing main API holds the email back', async () => {
  const s = memoryStore();
  const { world, handlers } = fakeWorld({ apiStatus: 503 });
  emitIssue(s, 'outbox');
  await drainUntilQuiet(s, handlers, 3);
  assert.equal(world.sends.length, 0);
  assert.equal(s.rows.find((r) => r.event_type === 'license.email').attempts, 0, 'email never claimed');
  world.apiStatus = 200;
  await drainUntilQuiet(s, handlers, 3);
  assert.equal(world.emailsDelivered, 1);
});

test('a dead activation still never sends the email (it waits, then dies)', async () => {
  const s = memoryStore({ maxAttempts: 2 });
  const { world, handlers } = fakeWorld({ apiStatus: 400 });
  emitIssue(s, 'outbox');
  await drainUntilQuiet(s, handlers, 4);
  assert.equal(s.rows.find((r) => r.event_type === 'license.activate').status, 'dead');
  assert.equal(world.sends.length, 0);
  assert.equal(s.rows.find((r) => r.event_type === 'license.email').status, 'dead');
});

test('answers map to emails: activated, claim, already-assigned (none)', async () => {
  for (const [answer, kinds, activated] of [
    [{ license_status: 'activated' }, ['activated'], true],
    [{ license_status: 'pending_invite', has_account: true }, ['claim'], false],
    [{ license_status: 'already_assigned' }, [], true],
  ]) {
    const s = memoryStore();
    const { world, handlers } = fakeWorld({ moilAnswer: answer });
    emitIssue(s, 'outbox');
    await drainUntilQuiet(s, handlers);
    assert.deepEqual(world.sends.map((x) => x.kind), kinds, answer.license_status);
    assert.equal(world.licenses.get(LID).is_activated, activated);
    if (!kinds.length) assert.equal(world.licenses.get(LID).email_status, 'skipped');
  }
});

test('duplicate delivery -> one effect (activation and email)', async () => {
  const { world, handlers } = fakeWorld();
  const act = { event_type: 'license.activate', aggregate_id: LID, payload: { license_id: LID, sender: 'outbox', plan: 'standard', billing_cycle: 'yearly' }, idempotency_key: `license.activate:${LID}` };
  const mail = { event_type: 'license.email', aggregate_id: LID, payload: { license_id: LID, sender: 'outbox' }, idempotency_key: `license.email:${LID}` };
  await handlers['license.activate'](act, act.idempotency_key);
  await handlers['license.activate'](act, act.idempotency_key);
  await handlers['license.email'](mail, mail.idempotency_key);
  await handlers['license.email'](mail, mail.idempotency_key);
  assert.equal(world.apiCalls.length, 1);
  assert.equal(world.sends.length, 1);
});

test('crash after the send and before the row update: redelivered, Resend dedupes on the key', async () => {
  const { world, handlers } = fakeWorld({ moilAnswer: { license_status: 'activated' } });
  const act = { event_type: 'license.activate', aggregate_id: LID, payload: { license_id: LID, sender: 'outbox' }, idempotency_key: 'k1' };
  await handlers['license.activate'](act, 'k1');
  const mail = { event_type: 'license.email', aggregate_id: LID, payload: { license_id: LID, sender: 'outbox' }, idempotency_key: `license.email:${LID}` };
  // First attempt: the email goes out but the process dies before email_status is written.
  const realSend = world.sends.length;
  await handlers['license.email'](mail, mail.idempotency_key);
  world.licenses.get(LID).email_status = 'pending';
  await handlers['license.email'](mail, mail.idempotency_key);
  assert.equal(world.sends.length - realSend, 2, 'sent twice to Resend');
  assert.equal(world.emailsDelivered, 1, 'but delivered once');
});

test('a Resend validation error is dead at once; a rate limit retries', async () => {
  const mail = { event_type: 'license.email', aggregate_id: LID, payload: { license_id: LID, sender: 'outbox' }, idempotency_key: 'k' };
  const a = fakeWorld({ moilAnswer: { license_status: 'activated' } });
  await a.handlers['license.activate']({ ...mail, event_type: 'license.activate' }, 'x');
  a.world.resendFails = 'validation_error';
  assert.equal((await a.handlers['license.email'](mail, 'k')).outcome, 'dead');
  a.world.resendFails = 'rate_limit_exceeded';
  assert.equal((await a.handlers['license.email'](mail, 'k')).outcome, 'retry');
});

test('legacy sender (shadow): never calls the main API or Resend, only verifies the route finished', async () => {
  const s = memoryStore();
  const { world, handlers } = fakeWorld();
  emitIssue(s, 'legacy');
  await drainOnce(s, handlers, drainOpts('r1'));
  assert.equal(s.rows[0].status, 'pending', 'route has not recorded email_status yet');
  world.licenses.get(LID).email_status = 'sent'; // the inline route finished
  s.advance(10 ** 8);
  const c = await drainOnce(s, handlers, drainOpts('r2'));
  s.advance(10 ** 8);
  const c2 = await drainOnce(s, handlers, drainOpts('r3'));
  assert.equal(c.shadowVerified + c2.shadowVerified, 2);
  assert.equal(world.apiCalls.length, 0);
  assert.equal(world.sends.length, 0);
});

test('canary boundary: for every licence exactly one of route and drain sends', async () => {
  const ids = Array.from({ length: 300 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
  for (const canary of [0, 10, 50, 100]) {
    for (const id of ids) {
      const sender = decideSender('on', canary, id);
      const routeSends = sender === 'legacy'; // add/route.ts sends inline only for 'legacy'
      const { world, handlers } = fakeWorld({ moilAnswer: { license_status: 'activated' } });
      world.licenses.set(id, { ...world.licenses.get(LID), id });
      if (routeSends) world.licenses.get(id).email_status = 'sent';
      const ev = (t) => ({ event_type: t, aggregate_id: id, payload: { license_id: id, sender }, idempotency_key: `${t}:${id}` });
      await handlers['license.activate'](ev('license.activate'), `license.activate:${id}`);
      await handlers['license.email'](ev('license.email'), `license.email:${id}`);
      const drainSends = world.apiCalls.length + world.sends.length > 0;
      assert.notEqual(routeSends, drainSends, `id ${id} at canary ${canary}`);
    }
  }
});

test('licence deleted before the drain: nothing is called', async () => {
  const s = memoryStore();
  const { world, handlers } = fakeWorld();
  world.licenses.clear();
  emitIssue(s, 'outbox');
  await drainUntilQuiet(s, handlers, 2);
  assert.equal(world.apiCalls.length, 0);
  assert.equal(world.sends.length, 0);
  assert.ok(s.rows.every((r) => r.status === 'delivered'));
});
