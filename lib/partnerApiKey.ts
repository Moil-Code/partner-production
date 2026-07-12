/**
 * Optional shared-secret check for the public external license endpoints
 * (verify / activate).
 *
 * Safe rollout: when PARTNER_SERVICE_API_KEY is UNSET the check always
 * passes (no breakage for existing callers). Once the env var is set,
 * callers must send a matching `x-partner-api-key` header.
 */
export function isPartnerApiKeyValid(request: Request): boolean {
  const expected = process.env.PARTNER_SERVICE_API_KEY;
  if (!expected) return true;
  return request.headers.get('x-partner-api-key') === expected;
}
