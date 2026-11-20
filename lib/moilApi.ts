/**
 * Server-side access to the Moil main API (the Express "Users API").
 *
 * SERVER ONLY. The partner key authenticates this app to the main API's
 * partner endpoints (buy-licenses, activate_license, grant/revoke add-ons).
 * It used to be read as `NEXT_PUBLIC_QC_API_KEY` from a client page, and a
 * `NEXT_PUBLIC_*` variable is inlined into the browser bundle by Next — so
 * the key shipped to every visitor of the dashboard. It now lives in
 * `MOIL_PARTNER_API_KEY` and is read only from route handlers.
 *
 * The old name is still read as a FALLBACK during the transition (one warning
 * per process), so a deploy before the new variable is set keeps working.
 * Remove the fallback once `MOIL_PARTNER_API_KEY` is set everywhere and the
 * old key has been rotated.
 *
 * Variable names are read through a computed `process.env[name]` lookup on
 * purpose: Next only inlines `process.env.NEXT_PUBLIC_X` written literally, so
 * even if a client file ever imported this module the key would not be
 * compiled into the bundle. The `typeof window` guard makes such an import
 * fail loudly instead of silently returning nothing.
 */

const KEY_NAMES = ['MOIL_PARTNER_API_KEY', 'NEXT_PUBLIC_QC_API_KEY'] as const;
const URL_NAMES = ['MOIL_API_URL', 'NEXT_PUBLIC_MOIL_PAYMENT_ACTIVATION'] as const;

let warnedKeyFallback = false;
let warnedUrlFallback = false;

function assertServer() {
  if (typeof window !== 'undefined') {
    throw new Error('lib/moilApi is server-only and must not be imported by client code.');
  }
}

function readEnv(name: string): string | null {
  const raw = process.env[name];
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  return trimmed === '' ? null : trimmed;
}

/** The partner API key for the main API, or null when not configured. */
export function moilPartnerApiKey(): string | null {
  assertServer();
  const primary = readEnv(KEY_NAMES[0]);
  if (primary) return primary;
  const legacy = readEnv(KEY_NAMES[1]);
  if (legacy && !warnedKeyFallback) {
    warnedKeyFallback = true;
    console.warn(
      `[moilApi] ${KEY_NAMES[0]} is not set; falling back to the legacy ${KEY_NAMES[1]}. ` +
        `Set ${KEY_NAMES[0]} (server-only) and remove the legacy variable.`,
    );
  }
  return legacy;
}

/** The main API base URL (no trailing slash), or null when not configured. */
export function moilApiUrl(): string | null {
  assertServer();
  const primary = readEnv(URL_NAMES[0]);
  const value = primary ?? readEnv(URL_NAMES[1]);
  if (!primary && value && !warnedUrlFallback) {
    warnedUrlFallback = true;
    console.warn(`[moilApi] ${URL_NAMES[0]} is not set; using ${URL_NAMES[1]}.`);
  }
  return value ? value.replace(/\/+$/, '') : null;
}
