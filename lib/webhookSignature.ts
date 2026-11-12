import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verify a Svix-signed webhook (the scheme Resend uses).
 *
 * Implemented here because the installed `resend` SDK (v4) has no verify
 * helper, and pulling in `svix` for one HMAC is not worth a dependency.
 *
 *   signed content = `${svix-id}.${svix-timestamp}.${raw body}`
 *   key            = base64-decode(secret without its `whsec_` prefix)
 *   svix-signature = space-separated `v1,<base64 HMAC-SHA256>` entries
 *                    (several while a secret is being rotated)
 *
 * The body MUST be the raw request text. Re-serialising parsed JSON changes
 * whitespace and key order and no signature will ever match.
 */

/** Resend retries for hours, but a replay older than this is refused. */
const TOLERANCE_SECONDS = 5 * 60;

export type SignatureCheck =
  | { ok: true }
  | { ok: false; reason: 'missing_headers' | 'stale_timestamp' | 'bad_signature' };

export function verifySvixSignature(
  secret: string,
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  nowSeconds: number = Math.floor(Date.now() / 1000),
): SignatureCheck {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return { ok: false, reason: 'missing_headers' };

  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > TOLERANCE_SECONDS) {
    return { ok: false, reason: 'stale_timestamp' };
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();

  for (const part of signature.split(' ')) {
    const [version, value] = part.split(',', 2);
    if (version !== 'v1' || !value) continue;
    const given = Buffer.from(value, 'base64');
    if (given.length === expected.length && timingSafeEqual(given, expected)) {
      return { ok: true };
    }
  }
  return { ok: false, reason: 'bad_signature' };
}
