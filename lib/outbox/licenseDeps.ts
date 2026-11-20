/**
 * Real dependencies for the licence outbox handlers (lib/outbox/licenseHandlers.ts):
 * the service-role Supabase client, the main API (lib/moilApi.ts, server only)
 * and Resend (lib/email.ts, through its rate-limited queue).
 *
 * Branding and URLs are built exactly as /api/licenses/add builds them.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { moilApiUrl, moilPartnerApiKey } from '@/lib/moilApi';
import { recordLicenseEmails } from '@/lib/licenseEmailLog';
import {
  sendLicenseActivatedEmail,
  sendLicenseActivationEmail,
  sendLicenseClaimEmail,
  type EdcEmailInfo,
} from '@/lib/email';
import type { Issuer, LicenseDeps, LicenseRow } from './licenseHandlers.ts';
import type { ImportIssuer, LicenseImportDeps } from './licenseImportHandlers.ts';

const ACTIVATE_TIMEOUT_MS = 10_000;

const LICENSE_COLUMNS =
  'id, email, admin_id, plan_tier, billing_cycle, months, is_activated, email_status, moil_license_status, moil_has_account';

type PartnerRow = {
  id: string;
  name: string | null;
  program_name?: string | null;
  logo_url?: string | null;
  logo_initial?: string | null;
  primary_color?: string | null;
  support_email?: string | null;
} | null;

function issuerFrom(admin: { first_name?: string | null; last_name?: string | null; partner?: PartnerRow } | null): Issuer {
  const partner = admin?.partner ?? null;
  const edc: EdcEmailInfo = {
    programName: partner?.program_name || partner?.name || 'Moil Partners',
    fullName: partner?.name || 'Moil Partners',
    logo: partner?.logo_url || undefined,
    logoInitial: partner?.logo_initial || partner?.name?.charAt(0) || 'M',
    primaryColor: partner?.primary_color || '#5843BE',
    supportEmail: partner?.support_email || 'support@moilapp.com',
    licenseDuration: '12 months',
  };
  return {
    sourceName: partner?.name || 'moil',
    partnerName: partner?.program_name || partner?.name || 'Moil Partners',
    orgSlug: (partner?.name || 'moil-partners').replace(/\s+/g, '-'),
    adminName: `${admin?.first_name ?? ''} ${admin?.last_name ?? ''}`.trim(),
    edc,
  };
}

export function licenseDeps(admin: SupabaseClient): LicenseDeps {
  return {
    async getLicense(id) {
      const { data, error } = await admin.from('licenses').select(LICENSE_COLUMNS).eq('id', id).maybeSingle();
      if (error) throw new Error(`licence read failed (${error.code ?? 'unknown'})`);
      return (data as LicenseRow | null) ?? null;
    },

    async getIssuer(adminId) {
      if (!adminId) return issuerFrom(null);
      const { data, error } = await admin
        .from('admins')
        .select('first_name, last_name, partner:partners(id, name, program_name, logo_url, logo_initial, primary_color, support_email)')
        .eq('id', adminId)
        .maybeSingle();
      if (error) throw new Error(`issuer read failed (${error.code ?? 'unknown'})`);
      return issuerFrom(data as unknown as Parameters<typeof issuerFrom>[0]);
    },

    async updateLicense(id, patch) {
      const { error } = await admin.from('licenses').update(patch).eq('id', id);
      if (error) throw new Error(`licence update failed (${error.code ?? 'unknown'})`);
    },

    async markActivated(id, at) {
      const { error } = await admin
        .from('licenses')
        .update({ is_activated: true, activated_at: at })
        .eq('id', id)
        .eq('is_activated', false);
      if (error) throw new Error(`licence activate-mark failed (${error.code ?? 'unknown'})`);
    },

    async callActivate(body) {
      const key = moilPartnerApiKey();
      const url = moilApiUrl();
      if (!key || !url) return null;
      const resp = await fetch(`${url}/api/employer/activate_license`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(ACTIVATE_TIMEOUT_MS),
      });
      let json: unknown = null;
      try {
        json = await resp.json();
      } catch {
        json = null;
      }
      return { status: resp.status, json };
    },

    async sendEmail(kind, a) {
      const edc = a.issuer.edc as EdcEmailInfo;
      if (kind === 'activated') {
        return sendLicenseActivatedEmail({
          email: a.email,
          loginUrl: a.loginUrl,
          partnerName: a.issuer.partnerName,
          planName: a.planName,
          edc,
          idempotencyKey: a.idempotencyKey,
        });
      }
      if (kind === 'claim') {
        return sendLicenseClaimEmail({
          email: a.email,
          loginUrl: a.loginUrl,
          partnerName: a.issuer.partnerName,
          edc,
          idempotencyKey: a.idempotencyKey,
        });
      }
      return sendLicenseActivationEmail({
        email: a.email,
        activationUrl: a.activationUrl,
        adminName: a.issuer.adminName,
        edc,
        idempotencyKey: a.idempotencyKey,
      });
    },

    async recordEmail(s) {
      await recordLicenseEmails(admin, [
        { messageId: s.messageId, licenseId: s.licenseId, kind: s.kind, recipient: s.recipient },
      ]);
    },

    appUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://business.moilapp.com',
    now: () => new Date().toISOString(),
  };
}

/**
 * Dependencies of the CSV import's handlers (lib/outbox/licenseImportHandlers.ts).
 * The issuer is built exactly as /api/licenses/import builds it: the admin's
 * name as `${first_name} ${last_name}`, partner branding only when the admin
 * has a partner (otherwise undefined, and the email resolves the branding from
 * the admin's email, as the import's batch send does), and the same template
 * (sendLicenseActivationEmail and the batch send render LicenseActivationEmail
 * with the same subject and branding rule).
 */
export function licenseImportDeps(admin: SupabaseClient): LicenseImportDeps {
  const base = licenseDeps(admin);
  return {
    getLicense: base.getLicense,
    updateLicense: base.updateLicense,
    markActivated: base.markActivated,
    callActivate: base.callActivate,
    appUrl: base.appUrl,
    now: base.now,

    async getImportIssuer(adminId): Promise<ImportIssuer> {
      if (!adminId) return { orgSlug: 'moil-partners', adminName: 'undefined undefined', adminEmail: undefined, edc: undefined };
      const { data, error } = await admin
        .from('admins')
        .select('first_name, last_name, email, partner:partners(id, name, program_name, logo_url, logo_initial, primary_color, support_email)')
        .eq('id', adminId)
        .maybeSingle();
      if (error) throw new Error(`issuer read failed (${error.code ?? 'unknown'})`);
      const row = data as unknown as {
        first_name?: string | null;
        last_name?: string | null;
        email?: string | null;
        partner?: PartnerRow;
      } | null;
      const partner = row?.partner ?? null;
      const edc: EdcEmailInfo | undefined = partner
        ? {
            programName: partner.program_name || partner.name || 'Moil Partners',
            fullName: partner.name || 'Moil Partners',
            logo: partner.logo_url || undefined,
            logoInitial: partner.logo_initial || partner.name?.charAt(0) || 'M',
            primaryColor: partner.primary_color || '#5843BE',
            supportEmail: partner.support_email || 'support@moilapp.com',
            licenseDuration: '12 months',
          }
        : undefined;
      return {
        orgSlug: (partner?.name || 'moil-partners').replace(/\s+/g, '-'),
        adminName: `${row?.first_name} ${row?.last_name}`,
        adminEmail: row?.email ?? undefined,
        edc,
      };
    },

    async sendImportEmail(a) {
      return sendLicenseActivationEmail({
        email: a.email,
        activationUrl: a.activationUrl,
        adminName: a.adminName,
        adminEmail: a.adminEmail,
        edc: a.edc as EdcEmailInfo | undefined,
        idempotencyKey: a.idempotencyKey,
      });
    },

    async recordEmail(s) {
      await recordLicenseEmails(admin, [
        { messageId: s.messageId, licenseId: s.licenseId, kind: s.kind, recipient: s.recipient },
      ]);
    },
  };
}
