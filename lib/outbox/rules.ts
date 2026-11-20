/**
 * Pure rules of the partner app's outbox. No imports (types only elsewhere),
 * so `node --test` can load this file directly (tests/outbox/).
 *
 * The SQL (database/add_outbox.sql) is the authority for claim and settle;
 * `retryDelaySeconds` mirrors its backoff so the schedule is pinned by a test
 * and readable here.
 */

export type FlowMode = 'off' | 'shadow' | 'on';
export type Sender = 'legacy' | 'outbox';
export type Outcome = 'delivered' | 'retry' | 'dead';

export const MAX_ATTEMPTS = 10;
export const DRAIN_BATCH_MAX = 20;
export const DRAIN_CHUNK = 5;
export const LEASE_SECONDS = 60;

/**
 * A flow's mode from its env value. Unset = the shipped default. Any value
 * we do not recognise is 'off' (fail safe: the legacy path, no emit), and
 * the caller logs it.
 */
export function parseFlowMode(
  raw: string | null | undefined,
  fallback: FlowMode,
): { mode: FlowMode; recognised: boolean } {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { mode: fallback, recognised: true };
  }
  const v = String(raw).trim().toLowerCase();
  if (v === 'off' || v === 'shadow' || v === 'on') return { mode: v, recognised: true };
  return { mode: 'off', recognised: false };
}

/** A canary percentage 0..100. Anything unreadable is 0 (nobody). */
export function parseCanary(raw: string | null | undefined): number {
  if (raw === undefined || raw === null) return 0;
  const s = String(raw).trim();
  if (!/^\d{1,3}$/.test(s)) return 0;
  const n = Number(s);
  return n >= 0 && n <= 100 ? n : 0;
}

/** True unless the value is the literal 'false' (the relay is ON by default). */
export function switchOn(raw: string | null | undefined): boolean {
  return String(raw ?? '').trim().toLowerCase() !== 'false';
}

/** FNV-1a 32-bit. Stable across processes and deploys; no crypto import. */
export function stableHash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 0..99 bucket of an aggregate id. */
export function canaryBucket(aggregateId: string): number {
  return stableHash(String(aggregateId).toLowerCase()) % 100;
}

/**
 * Who sends for this aggregate. Decided ONCE when the event is produced and
 * stored on the event (payload.sender); the legacy path reads the same value,
 * so one aggregate is never sent by both.
 *   off    -> legacy (and no event is emitted at all)
 *   shadow -> legacy (event emitted; the drain only verifies)
 *   on     -> outbox for buckets below the canary, legacy for the rest
 */
export function decideSender(mode: FlowMode, canary: number, aggregateId: string): Sender {
  if (mode !== 'on') return 'legacy';
  return canaryBucket(aggregateId) < canary ? 'outbox' : 'legacy';
}

/** Mirror of outbox_settle's backoff, without jitter: 10 s * 3^(n-1), cap 6 h. */
export function retryDelaySeconds(attempts: number): number {
  const n = Math.max(attempts - 1, 0);
  return Math.min(6 * 3600, 10 * Math.pow(3, n));
}

/** Retry becomes dead once the attempts used reach the maximum. */
export function retryBecomesDead(attempts: number, max = MAX_ATTEMPTS): boolean {
  return attempts >= max;
}

/**
 * last_error: at most 500 chars, URLs (and their query strings) and email
 * addresses removed, anything that looks like a bearer/api key masked.
 */
export function sanitizeError(err: unknown): string {
  let s: string;
  if (err instanceof Error) s = `${err.name}: ${err.message}`;
  else if (typeof err === 'string') s = err;
  else {
    try {
      s = JSON.stringify(err);
    } catch {
      s = String(err);
    }
  }
  s = s
    .replace(/https?:\/\/[^\s"'<>]+/gi, '<url>')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<email>')
    .replace(/(bearer\s+|key[=:]\s*|re_)[A-Za-z0-9._-]{8,}/gi, '$1<redacted>');
  return s.slice(0, 500);
}

/** Does this PostgREST / Postgres error mean the migration is not applied? */
export function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = String((error as { code?: unknown }).code ?? '');
  return ['42P01', '42883', 'PGRST202', 'PGRST205', '42703'].includes(code);
}

/**
 * The outcome for an HTTP answer from a consumer we called.
 * 2xx delivered; 408, 425, 429 and 5xx retry; 401/403 retry too (that is our
 * own key or config, which an operator fixes, and dead-lettering on it would
 * drop every event until somebody replays them); any other 4xx is dead.
 */
export function outcomeForHttp(status: number): Outcome {
  if (status >= 200 && status < 300) return 'delivered';
  if (status === 401 || status === 403 || status === 408 || status === 425 || status === 429) {
    return 'retry';
  }
  if (status >= 400 && status < 500) return 'dead';
  return 'retry';
}

/** Resend error names that will never succeed on retry. Everything else retries. */
const RESEND_PERMANENT = new Set([
  'validation_error',
  'missing_required_field',
  'invalid_parameter',
  'invalid_from_address',
  'invalid_idempotent_request',
]);

export function outcomeForResendError(name: string | null | undefined): Outcome {
  return name && RESEND_PERMANENT.has(name) ? 'dead' : 'retry';
}

// ---------- licence issue (PP-LICENSE-1) ----------

export type MoilLicenseStatus =
  | 'activated'
  | 'pending_invite'
  | 'already_assigned'
  | 'blocked_downgrade';

const MOIL_STATUSES = new Set<string>([
  'activated',
  'pending_invite',
  'already_assigned',
  'blocked_downgrade',
]);

export function isMoilLicenseStatus(v: unknown): v is MoilLicenseStatus {
  return typeof v === 'string' && MOIL_STATUSES.has(v);
}

export type LicenseEmailChoice = 'activated' | 'claim' | 'activation' | 'none';

/**
 * Which email the licensee gets, from the main API's answer. Same choice as
 * the inline route (/api/licenses/add), with one difference that is the
 * point of the outbox: an UNKNOWN answer (the call failed) is not an
 * activation email, it is "not yet" and the email step waits.
 */
export function chooseLicenseEmail(
  status: string | null | undefined,
  hasAccount: boolean | null | undefined,
): LicenseEmailChoice | 'wait' {
  if (status === 'activated') return 'activated';
  if (status === 'pending_invite') return hasAccount === true ? 'claim' : 'activation';
  if (status === 'already_assigned' || status === 'blocked_downgrade') return 'none';
  return 'wait';
}

/** The licence row is activated by these answers (as the inline route did). */
export function activatesLicense(status: string | null | undefined): boolean {
  return status === 'activated' || status === 'already_assigned' || status === 'blocked_downgrade';
}

/**
 * Shadow check (sender 'legacy'): the inline route writes email_status as its
 * LAST step, after the activation call and the email. Anything other than
 * 'pending' means it got there. 'failed' still counts (the route owns that
 * seat and the outbox must not send a second time) but is reported apart.
 */
export function shadowVerdict(emailStatus: string | null | undefined):
  | { outcome: 'delivered'; legacyFailed: boolean }
  | { outcome: 'retry' } {
  const s = emailStatus ?? 'pending';
  if (s === 'pending') return { outcome: 'retry' };
  return { outcome: 'delivered', legacyFailed: s === 'failed' };
}
