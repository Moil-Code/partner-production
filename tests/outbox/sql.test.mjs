// The SQL of database/add_outbox.sql and database/add_license_issue_outbox.sql.
//
// Part 1 always runs: it reads the files as text and pins the safety rules
// (RLS on, every function revoked from PUBLIC/anon/authenticated, SKIP LOCKED,
// seq ordering, the team row lock).
//
// Part 2 runs the SQL on a real Postgres ONLY when OUTBOX_TEST_PG_URL names a
// DISPOSABLE database (it drops and recreates the public schema), e.g.
//   OUTBOX_TEST_PG_URL=postgresql://postgres@localhost:55432/outbox_test npm run test:outbox
// Without it, part 2 is skipped and says so. Needs `psql` on the PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUTBOX_SQL = path.join(root, 'database/add_outbox.sql');
const ISSUE_SQL = path.join(root, 'database/add_license_issue_outbox.sql');
// Comments stripped, so a rule mentioned in a comment cannot satisfy a check.
const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');
const outboxText = stripComments(readFileSync(OUTBOX_SQL, 'utf8'));
const issueText = stripComments(readFileSync(ISSUE_SQL, 'utf8'));

// ---------- part 1: text ----------

function functionsIn(text) {
  return [...text.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
}

test('every function is SECURITY DEFINER and revoked from PUBLIC, anon, authenticated', () => {
  for (const text of [outboxText, issueText]) {
    const fns = functionsIn(text);
    assert.ok(fns.length > 0);
    for (const fn of fns) {
      assert.match(text, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\)\\s+FROM PUBLIC, anon, authenticated;`), fn);
      assert.match(text, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\)\\s+TO service_role;`), fn);
    }
    const definer = (text.match(/^SECURITY DEFINER$/gm) || []).length;
    assert.equal(definer, fns.length);
    assert.equal((text.match(/SET search_path = public/g) || []).length, fns.length);
  }
});

test('tables are RLS-on with no policies and closed to anon/authenticated', () => {
  for (const t of ['outbox_events', 'outbox_admin_log']) {
    assert.match(outboxText, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY;`));
    assert.match(outboxText, new RegExp(`REVOKE ALL ON public\\.${t} FROM PUBLIC, anon, authenticated;`));
  }
  assert.doesNotMatch(outboxText + issueText, /CREATE POLICY/);
});

test('claim uses SKIP LOCKED and orders by seq; issue locks the team row', () => {
  assert.match(outboxText, /FOR UPDATE SKIP LOCKED/);
  assert.match(outboxText, /o\.seq < e\.seq/);
  assert.match(issueText, /FROM public\.teams WHERE id = p_team_id\s+FOR UPDATE;/);
  assert.match(issueText, /'license\.activate:' \|\| v_id::TEXT/);
  assert.match(issueText, /'license\.email:' \|\| v_id::TEXT/);
  assert.equal((issueText.match(/'license:' \|\| v_id::TEXT/g) || []).length, 2);
  for (const t of [outboxText, issueText]) assert.match(t, /NOTIFY pgrst, 'reload schema';/);
});

// ---------- part 2: real Postgres ----------

const PG = process.env.OUTBOX_TEST_PG_URL;
const skip = PG ? false : 'OUTBOX_TEST_PG_URL not set: the SQL was NOT run against Postgres (text checks only)';

function psql(sql, { role } = {}) {
  const full = role ? `SET ROLE ${role}; ${sql}` : sql;
  return execFileSync('psql', [PG, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At', '-c', full], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
function psqlFile(file) {
  execFileSync('psql', [PG, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', file], { stdio: ['ignore', 'pipe', 'pipe'] });
}
function psqlAsync(sql) {
  return new Promise((resolve, reject) => {
    const p = spawn('psql', [PG, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql]);
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err))));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The parts of the partner schema issue_licenses touches, plus Supabase's roles.
const BASE = `
DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE TABLE public.teams (id UUID PRIMARY KEY, purchased_license_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE public.licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT NOT NULL, admin_id UUID, team_id UUID REFERENCES public.teams(id),
  partner_id UUID, business_name TEXT DEFAULT '', business_type TEXT DEFAULT '', is_activated BOOLEAN NOT NULL DEFAULT FALSE,
  activated_at TIMESTAMPTZ, plan_tier TEXT CHECK (plan_tier IS NULL OR plan_tier IN ('standard','professional','market_pro')),
  billing_cycle TEXT CHECK (billing_cycle IS NULL OR billing_cycle IN ('yearly','monthly')), months INTEGER,
  expires_at TIMESTAMPTZ, moil_user_id TEXT, message_id TEXT, email_status TEXT DEFAULT 'pending', performed_by UUID,
  grant_kind TEXT NOT NULL DEFAULT 'base', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
`;
const ADMIN = '00000000-0000-4000-8000-0000000000aa';
const TEAM = '00000000-0000-4000-8000-0000000000bb';
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`;
const issue = (rows, team = TEAM) =>
  JSON.parse(psql(`SELECT public.issue_licenses('${ADMIN}', ${team ? `'${team}'` : 'NULL'}, NULL, '${JSON.stringify(rows)}'::jsonb)`));
const row = (email, sender = 'outbox') => ({ id: uuid(), email, plan_tier: 'standard', billing_cycle: 'yearly', months: null, sender });
const reset = () => psql('TRUNCATE public.outbox_events, public.licenses, public.outbox_admin_log; DELETE FROM public.teams;');

test('postgres', { skip }, async (t) => {
  psql(BASE);
  // Applied twice: the migrations are re-runnable.
  for (let i = 0; i < 2; i += 1) {
    psqlFile(OUTBOX_SQL);
    psqlFile(ISSUE_SQL);
  }

  await t.test('only service_role may call the functions', () => {
    for (const role of ['anon', 'authenticated']) {
      assert.throws(() => psql(`SELECT * FROM public.outbox_claim('x', 1, 60)`, { role }), /permission denied/);
      assert.throws(() => psql(`SELECT public.issue_licenses(NULL, NULL, NULL, '[]')`, { role }), /permission denied/);
      assert.throws(() => psql(`SELECT count(*) FROM public.outbox_events`, { role }), /permission denied/);
    }
    assert.equal(psql(`SELECT count(*) FROM public.outbox_claim('x', 1, 60)`, { role: 'service_role' }), '0');
  });

  await t.test('emit is idempotent', () => {
    reset();
    for (let i = 0; i < 2; i += 1) {
      psql(`SELECT public.outbox_emit('t.e', 'agg', '1', NULL, '{}'::jsonb, 't.e:1')`);
    }
    assert.equal(psql('SELECT count(*) FROM public.outbox_events'), '1');
  });

  await t.test('two concurrent claimers take disjoint rows', async () => {
    reset();
    for (let i = 0; i < 6; i += 1) psql(`SELECT public.outbox_emit('t.e', 'agg', '${i}', NULL, '{}', 't.e:${i}')`);
    const a = psqlAsync(`BEGIN; SELECT id FROM public.outbox_claim('A', 4, 60); SELECT pg_sleep(1.5); COMMIT;`);
    await sleep(400);
    const b = psql(`SELECT id FROM public.outbox_claim('B', 10, 60)`).split('\n').filter(Boolean);
    const aIds = (await a).split('\n').filter((l) => /^[0-9a-f-]{36}$/.test(l));
    assert.equal(aIds.length, 4);
    assert.equal(b.length, 2);
    assert.equal(new Set([...aIds, ...b]).size, 6);
  });

  await t.test('lease expiry re-claims; only the holder settles', () => {
    reset();
    psql(`SELECT public.outbox_emit('t.e', 'agg', '1', NULL, '{}', 't.e:1')`);
    const id = psql(`SELECT id FROM public.outbox_claim('A', 1, 60)`);
    assert.equal(psql(`SELECT count(*) FROM public.outbox_claim('B', 1, 60)`), '0');
    psql(`UPDATE public.outbox_events SET locked_until = NOW() - INTERVAL '1 second'`);
    assert.equal(psql(`SELECT id || ',' || attempts FROM public.outbox_claim('B', 1, 60)`), `${id},2`);
    assert.equal(psql(`SELECT public.outbox_settle('${id}', 'A', 'delivered')`), 'not_holder');
    assert.equal(psql(`SELECT public.outbox_settle('${id}', 'B', 'delivered')`), 'delivered');
  });

  await t.test('backoff schedule with jitter, capped at 6 h; dead after 10 attempts', () => {
    reset();
    psql(`SELECT public.outbox_emit('t.e', 'agg', '1', NULL, '{}', 't.e:1')`);
    for (const attempt of [1, 2, 3, 9]) {
      psql(`UPDATE public.outbox_events SET attempts = ${attempt - 1}, next_attempt_at = NOW(), locked_until = NULL`);
      const id = psql(`SELECT id FROM public.outbox_claim('A', 1, 60)`);
      assert.equal(psql(`SELECT public.outbox_settle('${id}', 'A', 'retry', 'boom')`), 'pending');
      const wait = Number(psql(`SELECT EXTRACT(EPOCH FROM next_attempt_at - NOW()) FROM public.outbox_events`));
      const base = Math.min(21600, 10 * 3 ** (attempt - 1));
      assert.ok(wait >= base * 0.8 - 1 && wait <= Math.min(base * 1.2, 21600) + 1, `attempt ${attempt}: ${wait}s`);
    }
    psql(`UPDATE public.outbox_events SET attempts = 9, next_attempt_at = NOW()`);
    const id = psql(`SELECT id FROM public.outbox_claim('A', 1, 60)`);
    assert.equal(psql(`SELECT public.outbox_settle('${id}', 'A', 'retry', 'boom')`), 'dead');
    assert.equal(psql(`SELECT last_error FROM public.outbox_events`), 'boom');
  });

  await t.test('non-retryable outcome is dead at once', () => {
    reset();
    psql(`SELECT public.outbox_emit('t.e', 'agg', '1', NULL, '{}', 't.e:1')`);
    const id = psql(`SELECT id FROM public.outbox_claim('A', 1, 60)`);
    assert.equal(psql(`SELECT public.outbox_settle('${id}', 'A', 'dead', 'validation')`), 'dead');
    assert.equal(psql(`SELECT attempts FROM public.outbox_events`), '1');
  });

  await t.test('issue_licenses: insert + two ordered events in one transaction; email waits for activation', () => {
    reset();
    psql(`INSERT INTO public.teams VALUES ('${TEAM}', 5)`);
    const r = issue([row('A@Example.com'), row('b@example.com', 'legacy')]);
    assert.equal(r.status, 'ok');
    assert.equal(r.licenses.length, 2);
    assert.equal(r.licenses[0].email, 'a@example.com');
    assert.equal(psql(`SELECT count(*) FROM public.outbox_events`), '4');
    assert.equal(psql(`SELECT string_agg(DISTINCT payload->>'sender', ',' ORDER BY payload->>'sender') FROM public.outbox_events`), 'legacy,outbox');
    // No email address in any payload.
    assert.equal(psql(`SELECT count(*) FROM public.outbox_events WHERE payload::text LIKE '%@%'`), '0');
    const first = psql(`SELECT event_type FROM public.outbox_claim('A', 10, 60) ORDER BY 1`).split('\n');
    assert.deepEqual(first, ['license.activate', 'license.activate']);
    psql(`SELECT public.outbox_settle(id, 'A', 'delivered') FROM public.outbox_events WHERE event_type = 'license.activate'`);
    const second = psql(`SELECT event_type FROM public.outbox_claim('A', 10, 60)`).split('\n');
    assert.deepEqual(second, ['license.email', 'license.email']);
  });

  await t.test('issue_licenses: seats and duplicate emails', () => {
    reset();
    psql(`INSERT INTO public.teams VALUES ('${TEAM}', 2)`);
    assert.equal(issue([row('a@x.co'), row('b@x.co')]).status, 'ok');
    assert.deepEqual(issue([row('c@x.co')]), { status: 'no_seats', available: 0 });
    psql(`UPDATE public.teams SET purchased_license_count = 10`);
    assert.deepEqual(issue([row('c@x.co'), row('A@x.co')]), { status: 'exists', emails: ['a@x.co'] });
    assert.equal(psql(`SELECT count(*) FROM public.licenses`), '2', 'a refused batch inserts nothing');
    // No team: no seat check, as the routes did.
    assert.equal(issue([row('d@x.co')], null).status, 'ok');
    assert.throws(() => issue([{ id: uuid(), email: 'nope', sender: 'outbox' }]), /malformed row/);
  });

  await t.test('issue_licenses: two concurrent adds for the last seat -> exactly one wins', async () => {
    reset();
    psql(`INSERT INTO public.teams VALUES ('${TEAM}', 1)`);
    const call = (email) =>
      `SELECT public.issue_licenses('${ADMIN}', '${TEAM}', NULL, '${JSON.stringify([row(email)])}'::jsonb)`;
    const a = psqlAsync(`BEGIN; ${call('one@x.co')}; SELECT pg_sleep(1); COMMIT;`);
    await sleep(300);
    const b = JSON.parse(psql(call('two@x.co')));
    const aOut = JSON.parse((await a).split('\n').find((l) => l.startsWith('{')));
    assert.equal(aOut.status, 'ok');
    assert.deepEqual(b, { status: 'no_seats', available: 0 });
    assert.equal(psql(`SELECT count(*) FROM public.licenses`), '1');
  });

  await t.test('health, prune, replay and cancel', () => {
    reset();
    for (let i = 0; i < 3; i += 1) psql(`SELECT public.outbox_emit('t.e', 'agg', '${i}', NULL, '{}', 't.e:${i}')`);
    const [d, x] = psql(`SELECT id FROM public.outbox_claim('A', 2, 60)`).split('\n');
    psql(`SELECT public.outbox_settle('${d}', 'A', 'delivered')`);
    psql(`SELECT public.outbox_settle('${x}', 'A', 'dead', 'bad')`);
    assert.equal(psql(`SELECT event_type || ',' || pending || ',' || dead || ',' || delivered_last_hour FROM public.outbox_health()`), 't.e,1,1,1');

    psql(`UPDATE public.outbox_events SET delivered_at = NOW() - INTERVAL '15 days' WHERE id = '${d}'`);
    assert.equal(psql(`SELECT public.outbox_prune()`), '1');
    assert.equal(psql(`SELECT count(*) FROM public.outbox_events`), '2', 'dead and pending rows kept');

    assert.throws(() => psql(`SELECT public.outbox_replay('', ARRAY['${x}']::uuid[])`), /actor is required/);
    assert.equal(psql(`SELECT public.outbox_replay('ops@moil', ARRAY['${x}']::uuid[])`), '1');
    assert.equal(psql(`SELECT status || ',' || attempts FROM public.outbox_events WHERE id = '${x}'`), 'pending,0');
    assert.equal(psql(`SELECT public.outbox_cancel('ops@moil', 't.e')`), '2');
    assert.equal(psql(`SELECT count(*) FROM public.outbox_events WHERE status = 'cancelled'`), '2');
    assert.equal(psql(`SELECT string_agg(action || ':' || actor, ',' ORDER BY id) FROM public.outbox_admin_log`), 'replay:ops@moil,cancel:ops@moil');
  });
});
