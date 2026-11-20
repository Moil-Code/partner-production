/**
 * Outbox handlers for PP-LICENSE-1 (licence issue), behind injected
 * dependencies so tests run them against fakes. The real wiring is
 * lib/outbox/licenseDeps.ts.
 *
 *   license.activate  call the main API's activate_license for one licence and
 *                     record its answer on the licence row
 *                     (moil_license_status / moil_has_account).
 *   license.email     send the first email the answer calls for, with a
 *                     Resend idempotency key equal to the outbox key.
 *
 * Both events carry ordering_key 'license:<id>', so the email is never
 * claimed while the activation is still pending, and the email step also
 * WAITS (retry) until an answer is recorded: no email before activation
 * succeeded.
 *
 * payload.sender decides who sends (rules.decideSender, stored once):
 *   'legacy'  the inline route did it; we only verify it finished (shadow)
 *   'outbox'  we are the only sender
 *
 * Idempotency: a repeated activation is answered by the main API without a
 * second write (pending_invite is an upsert, a same-tier profile answers
 * already_assigned), and we skip it once an answer is recorded. A repeated
 * email reuses the same Resend key (24 h dedupe), and is skipped once
 * email_status left 'pending'.
 */

import type { Handler, HandlerResult, OutboxRow } from './drain.ts';
import {
  activatesLicense,
  chooseLicenseEmail,
  isMoilLicenseStatus,
  outcomeForHttp,
  outcomeForResendError,
  shadowVerdict,
  type LicenseEmailChoice,
} from './rules.ts';
import {
  describePlan,
  parsePlanKey,
  type BillingCycle,
  type LicensePlan,
} from '../licensePlanDefaults.ts';

export interface LicenseRow {
  id: string;
  email: string;
  admin_id: string | null;
  plan_tier: string | null;
  billing_cycle: string | null;
  months: number | null;
  is_activated: boolean;
  email_status: string | null;
  moil_license_status: string | null;
  moil_has_account: boolean | null;
}

/** Who issued the licence, as the emails and the main API need it. */
export interface Issuer {
  /** partners.name, the main API's `source` ('moil' when none). */
  sourceName: string;
  /** The program name shown in emails. */
  partnerName: string;
  /** URL slug of the partner name. */
  orgSlug: string;
  adminName: string;
  /** Opaque email branding passed through to the email senders. */
  edc: unknown;
}

export type FirstEmailKind = Exclude<LicenseEmailChoice, 'none'>;

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorName?: string;
}

export interface LicenseDeps {
  /** null when the licence no longer exists. Throws on a read failure. */
  getLicense(id: string): Promise<LicenseRow | null>;
  /** Always answers (defaults when the admin or partner is gone). Throws on a read failure. */
  getIssuer(adminId: string | null): Promise<Issuer>;
  /** Throws on a write failure. */
  updateLicense(id: string, patch: Record<string, unknown>): Promise<void>;
  /** is_activated = true and activated_at, only while it is still false. */
  markActivated(id: string, at: string): Promise<void>;
  /** null when the main API is not configured. Throws on a network failure or timeout. */
  callActivate(body: unknown): Promise<{ status: number; json: unknown } | null>;
  sendEmail(
    kind: FirstEmailKind,
    args: {
      email: string;
      licenseId: string;
      issuer: Issuer;
      planName: string;
      idempotencyKey: string;
      loginUrl: string;
      activationUrl: string;
    },
  ): Promise<SendResult>;
  recordEmail(send: { messageId: string; licenseId: string; kind: FirstEmailKind; recipient: string }): Promise<void>;
  appUrl: string;
  now(): string;
}

function senderOf(event: OutboxRow): 'legacy' | 'outbox' {
  return event.payload?.sender === 'outbox' ? 'outbox' : 'legacy';
}

function licenseIdOf(event: OutboxRow): string {
  const fromPayload = event.payload?.license_id;
  return typeof fromPayload === 'string' && fromPayload ? fromPayload : event.aggregate_id;
}

async function shadowCheck(deps: LicenseDeps, licenseId: string): Promise<HandlerResult> {
  const license = await deps.getLicense(licenseId);
  // Deleted before we looked: nothing left to verify.
  if (!license) return { outcome: 'delivered', shadow: true };
  const v = shadowVerdict(license.email_status);
  if (v.outcome === 'retry') {
    return { outcome: 'retry', error: 'shadow: inline route has not recorded email_status yet' };
  }
  return { outcome: 'delivered', shadow: true, legacyFailed: v.legacyFailed };
}

function planDefaultsFor(event: OutboxRow, license: LicenseRow) {
  const plan = (event.payload?.plan ?? license.plan_tier) as LicensePlan | null;
  const billingCycle = (event.payload?.billing_cycle ?? license.billing_cycle) as BillingCycle | null;
  const monthsRaw = event.payload?.months ?? license.months;
  const months = typeof monthsRaw === 'number' ? monthsRaw : null;
  const defaults: { plan: LicensePlan | null; billingCycle: BillingCycle | null; months?: number } = {
    plan,
    billingCycle,
  };
  if (billingCycle === 'monthly' && months) defaults.months = months;
  return defaults;
}

export function makeLicenseHandlers(deps: LicenseDeps): Record<string, Handler> {
  const activate: Handler = async (event) => {
    const licenseId = licenseIdOf(event);
    if (senderOf(event) === 'legacy') return shadowCheck(deps, licenseId);

    const license = await deps.getLicense(licenseId);
    if (!license) return { outcome: 'delivered' };
    // Already answered (a redelivery after a crash before settle).
    if (isMoilLicenseStatus(license.moil_license_status)) return { outcome: 'delivered' };

    const issuer = await deps.getIssuer(license.admin_id);
    const defaults = planDefaultsFor(event, license);
    if (!defaults.plan || !defaults.billingCycle) {
      return { outcome: 'dead', error: 'licence has no plan to activate' };
    }

    const res = await deps.callActivate({
      emails: [{ email: license.email, licenseId: license.id }],
      defaults,
      source: issuer.sourceName || 'moil',
      requestedBy: license.admin_id,
    });
    if (!res) return { outcome: 'retry', error: 'main API not configured on the partner app' };

    const httpOutcome = outcomeForHttp(res.status);
    if (httpOutcome !== 'delivered') {
      return { outcome: httpOutcome, error: `activate_license answered HTTP ${res.status}` };
    }

    const results = (res.json as { data?: { results?: unknown[] } } | null)?.data?.results;
    const first = Array.isArray(results) ? (results[0] as Record<string, unknown> | undefined) : undefined;
    const status = first?.license_status;
    if (!first || !isMoilLicenseStatus(status)) {
      return { outcome: 'retry', error: 'activate_license answered without a known license_status' };
    }

    const at = deps.now();
    const resolved = parsePlanKey(typeof first.plan === 'string' ? first.plan : undefined);
    const patch: Record<string, unknown> = {
      moil_license_status: status,
      moil_has_account: first.has_account === true,
      moil_activation_at: at,
      ...(typeof first.moil_user_id === 'string' && first.moil_user_id ? { moil_user_id: first.moil_user_id } : {}),
      ...(typeof first.expiresAt === 'string' && first.expiresAt ? { expires_at: first.expiresAt } : {}),
      ...(resolved ? { plan_tier: resolved.planTier, billing_cycle: resolved.billingCycle } : {}),
    };
    await deps.updateLicense(license.id, patch);
    if (activatesLicense(status)) await deps.markActivated(license.id, at);
    return { outcome: 'delivered' };
  };

  const email: Handler = async (event, idempotencyKey) => {
    const licenseId = licenseIdOf(event);
    if (senderOf(event) === 'legacy') return shadowCheck(deps, licenseId);

    const license = await deps.getLicense(licenseId);
    if (!license) return { outcome: 'delivered' };
    // Someone already emailed (a redelivery, or a manual resend meanwhile).
    if ((license.email_status ?? 'pending') !== 'pending') return { outcome: 'delivered' };

    const choice = chooseLicenseEmail(license.moil_license_status, license.moil_has_account);
    if (choice === 'wait') {
      return { outcome: 'retry', error: 'activation has not succeeded yet; email waits' };
    }
    if (choice === 'none') {
      await deps.updateLicense(license.id, { email_status: 'skipped' });
      return { outcome: 'delivered' };
    }

    const issuer = await deps.getIssuer(license.admin_id);
    const planName =
      license.plan_tier && license.billing_cycle
        ? describePlan(
            license.plan_tier as LicensePlan,
            license.billing_cycle as BillingCycle,
            license.months ?? undefined,
          )
        : 'your plan';
    const r = await deps.sendEmail(choice, {
      email: license.email,
      licenseId: license.id,
      issuer,
      planName,
      idempotencyKey,
      loginUrl: `${deps.appUrl}/login?ref=moilPartners&org=${issuer.orgSlug}`,
      activationUrl: `${deps.appUrl}/register?licenseId=${license.id}&ref=moilPartners&org=${issuer.orgSlug}`,
    });
    if (!r.success) {
      return {
        outcome: outcomeForResendError(r.errorName),
        error: `resend refused: ${r.errorName ?? 'unknown'}`,
      };
    }

    await deps.updateLicense(license.id, {
      email_status: 'sent',
      ...(r.messageId ? { message_id: r.messageId } : {}),
    });
    if (r.messageId) {
      await deps.recordEmail({ messageId: r.messageId, licenseId: license.id, kind: choice, recipient: license.email });
    }
    return { outcome: 'delivered' };
  };

  return { 'license.activate': activate, 'license.email': email };
}
