/**
 * Outbox handlers for PP-LICENSE-2 (the CSV import), behind injected
 * dependencies so tests run them against fakes. Real wiring:
 * lib/outbox/licenseDeps.ts (licenseImportDeps).
 *
 *   license.activate (payload.flow = 'import')
 *       the import's activation, exactly the request the route sends today
 *       ({ emails: [email], defaults }, no source), and only 'activated'
 *       marks the licence activated, as the route does.
 *   license.import_email
 *       the import's email: the activation ("register") email, unless the main
 *       API answered 'activated'. Nothing else, whatever the answer (a person
 *       who already has a Moil account still gets it, as today).
 *
 * What the import does today when the activation cannot be had (the call
 * fails, the main API is not configured): it still sends the activation email.
 * The outbox keeps that: a retryable failure is retried, and once it is final
 * (a non-retryable answer, the last attempt, no main API) the licence is
 * marked moil_license_status = 'activation_failed' and the email goes out as
 * today. So a person always ends up with exactly today's email; only the
 * plan is applied more often (transient failures are retried).
 *
 * payload.sender (stored once, rules.decideSender):
 *   'legacy'  the route did it; verify only (shadow). payload.expects_email
 *             false = the route deliberately sent no email ('activated'), so
 *             there is nothing to wait for.
 *   'outbox'  we are the only sender.
 */

import type { Handler, HandlerResult, OutboxRow } from './drain.ts';
import type { LicenseDeps, SendResult } from './licenseHandlers.ts';
import {
  MAX_ATTEMPTS,
  isMoilLicenseStatus,
  outcomeForHttp,
  outcomeForResendError,
  shadowVerdict,
} from './rules.ts';
import { parsePlanKey } from '../licensePlanDefaults.ts';

/** Written only by this flow: the activation is final and did not happen. */
export const ACTIVATION_FAILED = 'activation_failed';

/** What the import's email needs about who issued it, as the route builds it. */
export interface ImportIssuer {
  orgSlug: string;
  /** `${first_name} ${last_name}`, exactly as the route writes it. */
  adminName: string;
  adminEmail: string | undefined;
  /** Partner branding; undefined when the admin has no partner (the email then resolves it from adminEmail, as today). */
  edc: unknown;
}

export interface LicenseImportDeps
  extends Pick<LicenseDeps, 'getLicense' | 'updateLicense' | 'markActivated' | 'callActivate' | 'appUrl' | 'now'> {
  getImportIssuer(adminId: string | null): Promise<ImportIssuer>;
  sendImportEmail(args: {
    email: string;
    activationUrl: string;
    adminName: string;
    adminEmail: string | undefined;
    edc: unknown;
    idempotencyKey: string;
  }): Promise<SendResult>;
  recordEmail(send: { messageId: string; licenseId: string; kind: 'activation'; recipient: string }): Promise<void>;
}

function licenseIdOf(event: OutboxRow): string {
  const v = event.payload?.license_id;
  return typeof v === 'string' && v ? v : event.aggregate_id;
}

async function shadowCheck(deps: LicenseImportDeps, event: OutboxRow): Promise<HandlerResult> {
  if (event.payload?.expects_email === false) return { outcome: 'delivered', shadow: true };
  const license = await deps.getLicense(licenseIdOf(event));
  if (!license) return { outcome: 'delivered', shadow: true };
  const v = shadowVerdict(license.email_status);
  if (v.outcome === 'retry') {
    return { outcome: 'retry', error: 'shadow: import route has not recorded email_status yet' };
  }
  return { outcome: 'delivered', shadow: true, legacyFailed: v.legacyFailed };
}

/** The defaults object exactly as the route sends it: { plan, billingCycle[, months] }. */
function defaultsOf(event: OutboxRow) {
  const plan = event.payload?.plan;
  const billingCycle = event.payload?.billing_cycle;
  if (typeof plan !== 'string' || typeof billingCycle !== 'string') return null;
  const months = event.payload?.months;
  return billingCycle === 'monthly' && typeof months === 'number' && months > 0
    ? { plan, billingCycle, months }
    : { plan, billingCycle };
}

export function makeLicenseImportHandlers(deps: LicenseImportDeps): {
  activate: Handler;
  email: Handler;
} {
  const giveUp = async (licenseId: string, why: string): Promise<HandlerResult> => {
    await deps.updateLicense(licenseId, {
      moil_license_status: ACTIVATION_FAILED,
      moil_activation_at: deps.now(),
    });
    return { outcome: 'dead', error: `${why}; the import email goes out as before` };
  };
  /** Retry while attempts remain; on the last one, give up so the email still goes. */
  const retryOrGiveUp = (event: OutboxRow, licenseId: string, why: string): Promise<HandlerResult> | HandlerResult =>
    event.attempts >= MAX_ATTEMPTS ? giveUp(licenseId, why) : { outcome: 'retry', error: why };

  const activate: Handler = async (event) => {
    if (event.payload?.sender !== 'outbox') return shadowCheck(deps, event);
    const licenseId = licenseIdOf(event);

    const license = await deps.getLicense(licenseId);
    if (!license) return { outcome: 'delivered' };
    // Already answered (a redelivery after a crash before settle), or given up.
    if (isMoilLicenseStatus(license.moil_license_status) || license.moil_license_status === ACTIVATION_FAILED) {
      return { outcome: 'delivered' };
    }

    const defaults = defaultsOf(event);
    if (!defaults) return giveUp(licenseId, 'import event has no plan');

    let res: { status: number; json: unknown } | null;
    try {
      res = await deps.callActivate({ emails: [license.email], defaults });
    } catch {
      return retryOrGiveUp(event, licenseId, 'activate_license call failed');
    }
    // Today the import skips the activation when the main API is not configured.
    if (!res) return giveUp(licenseId, 'main API not configured on the partner app');

    const http = outcomeForHttp(res.status);
    if (http === 'dead') return giveUp(licenseId, `activate_license answered HTTP ${res.status}`);
    if (http === 'retry') return retryOrGiveUp(event, licenseId, `activate_license answered HTTP ${res.status}`);

    const results = (res.json as { data?: { results?: unknown[] } } | null)?.data?.results;
    const list = Array.isArray(results) ? (results as Record<string, unknown>[]) : [];
    const first =
      list.find((r) => typeof r?.email === 'string' && r.email.toLowerCase() === license.email.toLowerCase()) ??
      list[0];
    const status = first?.license_status;
    if (!first || !isMoilLicenseStatus(status)) {
      return retryOrGiveUp(event, licenseId, 'activate_license answered without a known license_status');
    }

    const at = deps.now();
    const resolved = parsePlanKey(typeof first.plan === 'string' ? first.plan : undefined);
    await deps.updateLicense(licenseId, {
      moil_license_status: status,
      moil_has_account: first.has_account === true,
      moil_activation_at: at,
      ...(typeof first.moil_user_id === 'string' && first.moil_user_id ? { moil_user_id: first.moil_user_id } : {}),
      ...(typeof first.expiresAt === 'string' && first.expiresAt ? { expires_at: first.expiresAt } : {}),
      ...(resolved ? { plan_tier: resolved.planTier, billing_cycle: resolved.billingCycle } : {}),
    });
    // The import marks a licence activated only on 'activated' (unlike /add).
    if (status === 'activated') await deps.markActivated(licenseId, at);
    return { outcome: 'delivered' };
  };

  const email: Handler = async (event, idempotencyKey) => {
    if (event.payload?.sender !== 'outbox') return shadowCheck(deps, event);
    const licenseId = licenseIdOf(event);

    const license = await deps.getLicense(licenseId);
    if (!license) return { outcome: 'delivered' };
    if ((license.email_status ?? 'pending') !== 'pending') return { outcome: 'delivered' };

    if (event.payload?.needs_activation === true) {
      const s = license.moil_license_status;
      if (!s) return { outcome: 'retry', error: 'activation has not answered yet; email waits' };
      if (s === 'activated') {
        await deps.updateLicense(licenseId, { email_status: 'skipped' });
        return { outcome: 'delivered' };
      }
    }

    const issuer = await deps.getImportIssuer(license.admin_id);
    const r = await deps.sendImportEmail({
      email: license.email,
      activationUrl: `${deps.appUrl}/register?licenseId=${license.id}&ref=moilPartners&org=${issuer.orgSlug}`,
      adminName: issuer.adminName,
      adminEmail: issuer.adminEmail,
      edc: issuer.edc,
      idempotencyKey,
    });
    if (!r.success) {
      return { outcome: outcomeForResendError(r.errorName), error: `resend refused: ${r.errorName ?? 'unknown'}` };
    }
    await deps.updateLicense(licenseId, { email_status: 'sent', ...(r.messageId ? { message_id: r.messageId } : {}) });
    if (r.messageId) {
      await deps.recordEmail({ messageId: r.messageId, licenseId, kind: 'activation', recipient: license.email });
    }
    return { outcome: 'delivered' };
  };

  return { activate, email };
}

/**
 * The drain's handler map: /add's handlers plus the import's. license.activate
 * is shared by both flows (one event type, one ordering key); payload.flow
 * picks the import's request.
 */
export function withImportHandlers(base: Record<string, Handler>, deps: LicenseImportDeps): Record<string, Handler> {
  const imp = makeLicenseImportHandlers(deps);
  const addActivate = base['license.activate'];
  return {
    ...base,
    'license.activate': (event, key) =>
      event.payload?.flow === 'import' ? imp.activate(event, key) : addActivate(event, key),
    'license.import_email': imp.email,
  };
}
