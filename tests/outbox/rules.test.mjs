import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFlowMode,
  parseCanary,
  switchOn,
  canaryBucket,
  decideSender,
  retryDelaySeconds,
  retryBecomesDead,
  sanitizeError,
  isMissingObject,
  outcomeForHttp,
  outcomeForResendError,
  chooseLicenseEmail,
  activatesLicense,
  shadowVerdict,
} from '../../lib/outbox/rules.ts';

const ids = Array.from({ length: 2000 }, (_, i) =>
  `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
);

test('flow mode: unset is the default, junk is off', () => {
  assert.deepEqual(parseFlowMode(undefined, 'shadow'), { mode: 'shadow', recognised: true });
  assert.deepEqual(parseFlowMode('', 'shadow'), { mode: 'shadow', recognised: true });
  assert.deepEqual(parseFlowMode(' ON ', 'shadow'), { mode: 'on', recognised: true });
  assert.deepEqual(parseFlowMode('true', 'shadow'), { mode: 'off', recognised: false });
});

test('canary: 0..100 integers only, everything else is 0', () => {
  assert.equal(parseCanary(undefined), 0);
  assert.equal(parseCanary('10'), 10);
  assert.equal(parseCanary('100'), 100);
  assert.equal(parseCanary('101'), 0);
  assert.equal(parseCanary('-5'), 0);
  assert.equal(parseCanary('10.5'), 0);
  assert.equal(parseCanary('abc'), 0);
});

test('relay switch is on unless the literal false', () => {
  assert.equal(switchOn(undefined), true);
  assert.equal(switchOn('true'), true);
  assert.equal(switchOn('FALSE'), false);
});

test('sender: off and shadow never pick the outbox; canary 0 and 100 are exact', () => {
  for (const id of ids.slice(0, 200)) {
    assert.equal(decideSender('off', 100, id), 'legacy');
    assert.equal(decideSender('shadow', 100, id), 'legacy');
    assert.equal(decideSender('on', 0, id), 'legacy');
    assert.equal(decideSender('on', 100, id), 'outbox');
  }
});

test('sender: stable per id, and raising the canary only moves ids legacy -> outbox', () => {
  const at10 = new Set(ids.filter((id) => decideSender('on', 10, id) === 'outbox'));
  const at50 = new Set(ids.filter((id) => decideSender('on', 50, id) === 'outbox'));
  for (const id of at10) assert.ok(at50.has(id), 'an outbox id at 10% stays outbox at 50%');
  for (const id of ids) assert.equal(decideSender('on', 37, id), decideSender('on', 37, id));
  // Roughly proportional (FNV over sequential ids is not perfectly uniform).
  assert.ok(at10.size > 100 && at10.size < 320, `10% canary picked ${at10.size} of 2000`);
  assert.ok(at50.size > 800 && at50.size < 1200, `50% canary picked ${at50.size} of 2000`);
  // Case does not move a licence between buckets.
  assert.equal(canaryBucket(ids[3].toUpperCase()), canaryBucket(ids[3]));
});

test('backoff schedule mirrors outbox_settle: 10 s * 3^(n-1), capped at 6 h', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(retryDelaySeconds),
    [10, 30, 90, 270, 810, 2430, 7290, 21600, 21600, 21600],
  );
  // The whole retry life of an email fits Resend's 24 h idempotency window.
  const total = [1, 2, 3, 4, 5, 6, 7, 8, 9].reduce((s, n) => s + retryDelaySeconds(n) * 1.2, 0);
  assert.ok(total < 24 * 3600, `retries span ${Math.round(total / 3600)} h`);
  assert.equal(retryBecomesDead(9), false);
  assert.equal(retryBecomesDead(10), true);
});

test('last_error strips URLs, emails and key-looking strings and caps at 500', () => {
  const s = sanitizeError(
    new Error('fetch https://api.example.com/x?token=abc failed for jane@example.com with Bearer abcdefghijklmnop'),
  );
  assert.ok(!s.includes('https://'), s);
  assert.ok(!s.includes('token=abc'), s);
  assert.ok(!s.includes('jane@example.com'), s);
  assert.ok(!s.includes('abcdefghijklmnop'), s);
  assert.equal(sanitizeError('x'.repeat(900)).length, 500);
});

test('missing migration codes are recognised', () => {
  for (const code of ['42P01', '42883', 'PGRST202', 'PGRST205', '42703']) {
    assert.equal(isMissingObject({ code }), true, code);
  }
  assert.equal(isMissingObject({ code: '23505' }), false);
  assert.equal(isMissingObject(null), false);
});

test('HTTP outcomes: 4xx dead except auth/408/425/429; 5xx retry', () => {
  assert.equal(outcomeForHttp(200), 'delivered');
  assert.equal(outcomeForHttp(400), 'dead');
  assert.equal(outcomeForHttp(404), 'dead');
  assert.equal(outcomeForHttp(422), 'dead');
  for (const s of [401, 403, 408, 425, 429, 500, 502, 503]) assert.equal(outcomeForHttp(s), 'retry', String(s));
  assert.equal(outcomeForResendError('validation_error'), 'dead');
  assert.equal(outcomeForResendError('rate_limit_exceeded'), 'retry');
  assert.equal(outcomeForResendError(undefined), 'retry');
});

test('which first email: same as the inline route, except an unknown answer waits', () => {
  assert.equal(chooseLicenseEmail('activated', false), 'activated');
  assert.equal(chooseLicenseEmail('pending_invite', true), 'claim');
  assert.equal(chooseLicenseEmail('pending_invite', false), 'activation');
  assert.equal(chooseLicenseEmail('pending_invite', null), 'activation');
  assert.equal(chooseLicenseEmail('already_assigned', null), 'none');
  assert.equal(chooseLicenseEmail('blocked_downgrade', null), 'none');
  assert.equal(chooseLicenseEmail(null, null), 'wait');
  assert.equal(chooseLicenseEmail('weird', true), 'wait');
  assert.equal(activatesLicense('activated'), true);
  assert.equal(activatesLicense('pending_invite'), false);
});

test('shadow verdict: pending waits, anything else is the route having finished', () => {
  assert.deepEqual(shadowVerdict('pending'), { outcome: 'retry' });
  assert.deepEqual(shadowVerdict(null), { outcome: 'retry' });
  assert.deepEqual(shadowVerdict('sent'), { outcome: 'delivered', legacyFailed: false });
  assert.deepEqual(shadowVerdict('skipped'), { outcome: 'delivered', legacyFailed: false });
  assert.deepEqual(shadowVerdict('failed'), { outcome: 'delivered', legacyFailed: true });
});
