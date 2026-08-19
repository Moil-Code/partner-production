/**
 * The shared secret the Moil backend authenticates with, under either name.
 *
 * Deployments carry this as `INTERNAL_API_KEY`; the routes in this repo were
 * written against `MOIL_INTERNAL_API_KEY`. Both are accepted, `INTERNAL_API_KEY`
 * first — the same both-names pattern the Moil backend uses for
 * `SUPABASE_URL || BPLAN_SUPABASE_URL`.
 *
 * READING BOTH RATHER THAN RENAMING IS DELIBERATE. A rename needs every
 * environment updated in lockstep with the deploy, and the state in between is
 * a 401 that reads as a wrong key rather than as a half-finished migration —
 * which is the single hardest version of this failure to diagnose, because both
 * sides can be truthfully shown to "have the value set".
 *
 * The value is TRIMMED, and that is not tidiness either. A key pasted into a
 * hosting dashboard routinely arrives with a trailing newline. Untrimmed it is
 * still truthy, so every "is it configured" check passes, and the comparison
 * then fails for a reason invisible on both sides.
 */

import { createHash } from 'crypto';

export const INTERNAL_KEY_NAMES = [
  'INTERNAL_API_KEY',
  'MOIL_INTERNAL_API_KEY',
] as const;

export function internalApiKey(): string | null {
  for (const name of INTERNAL_KEY_NAMES) {
    const raw = process.env[name];
    if (raw === undefined || raw === null) continue;
    const trimmed = String(raw).trim();
    if (trimmed !== '') return trimmed;
  }
  return null;
}

/** The header a caller may present, trimmed for the same reason. */
export function providedApiKey(request: Request): string | null {
  const raw =
    request.headers.get('x-internal-api-key') || request.headers.get('x-api-key');
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * The body for a not-configured response. It names THIS deployment explicitly:
 * three processes can complain about the same variable, and an operator reading
 * a bare "not set" has the variable name and no idea which machine to set it on.
 */
export function notConfiguredBody(routeLabel: string) {
  return {
    error: `${routeLabel} is not configured on the partner app.`,
    detail:
      `Neither ${INTERNAL_KEY_NAMES.join(' nor ')} is set in THIS deployment's ` +
      "environment (the partner app, not the Moil backend). Either name works, " +
      'and the value must match what the Moil backend sends — on Vercel, ' +
      'environment variables are only picked up by a new build.',
  };
}


/**
 * An 8-char digest of a value. Never the value.
 */
export function fingerprint(value: string | null | undefined): string | null {
  if (!value) return null;
  return createHash('sha256').update(value).digest('hex').slice(0, 8);
}

/**
 * The 401 body.
 *
 * OUTSIDE PRODUCTION it carries the fingerprint of the key we expect and of the
 * one we received. That is the entire question a 401 poses between two
 * first-party services — "are these the same secret?" — and neither side could
 * previously answer it, so the operator is reduced to comparing values by eye
 * across two dashboards, which is exactly where a trailing newline or a
 * half-pasted key survives inspection.
 *
 * IN PRODUCTION it is the bare word, unchanged. The caller here is
 * unauthenticated by definition, and handing an unauthenticated caller anything
 * derived from a secret is a bad trade for a debugging convenience — an 8-char
 * digest lets a guess be checked offline instead of against a rate-limited
 * endpoint. `NODE_ENV` is 'production' for Vercel production AND preview
 * builds, so this only ever opens up on a developer's own machine.
 */
export function unauthorizedBody(expected: string | null, received: string | null) {
  if (process.env.NODE_ENV === 'production') {
    return { error: 'Unauthorized' };
  }
  return {
    error: 'Unauthorized',
    // Named so it is obvious these are digests, not keys.
    hint: 'Key mismatch. These are SHA-256 prefixes, not the keys themselves.',
    expectedFingerprint: fingerprint(expected),
    receivedFingerprint: fingerprint(received),
    expectedFromEnv: INTERNAL_KEY_NAMES.find(
      (n) => (process.env[n] || '').trim() !== '',
    ) || null,
    received: received ? 'a key was presented' : 'no key was presented',
  };
}
