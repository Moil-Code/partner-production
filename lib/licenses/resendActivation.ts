import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import { sendLicenseActivationEmail, type EdcEmailInfo } from '@/lib/email';
import { recordLicenseEmails } from '@/lib/licenseEmailLog';
import { UNDELIVERABLE_EMAIL_STATES } from '@/lib/emailStatus';
import {
  loadManageableLicense,
  logLicenseActivity,
  type LicenseActor,
} from '@/lib/licenses/access';

/**
 * Re-send one license's activation email.
 *
 * Shared by POST /api/licenses/resend (one seat, from a row's button) and
 * POST /api/licenses/resend-bulk (many seats). One implementation so the two
 * cannot drift — e.g. one of them forgetting to reset the reminder cycle or to
 * log the send for webhook tracking.
 */

export interface PartnerBranding {
  id: string;
  name: string;
  program_name?: string | null;
  logo_url?: string | null;
  logo_initial?: string | null;
  primary_color?: string | null;
  support_email?: string | null;
}

export const PARTNER_BRANDING_COLUMNS =
  'id, name, program_name, logo_url, logo_initial, primary_color, support_email';

function buildEdcInfo(partner: PartnerBranding | null): EdcEmailInfo | undefined {
  if (!partner) return undefined;
  return {
    programName: partner.program_name || partner.name || 'Moil Partners',
    fullName: partner.name || 'Moil Partners',
    // Don't default to the Moil logo — the template falls back to logoInitial.
    logo: partner.logo_url || undefined,
    logoInitial: partner.logo_initial || partner.name?.charAt(0) || 'M',
    primaryColor: partner.primary_color || '#5843BE',
    supportEmail: partner.support_email || 'support@moilapp.com',
    licenseDuration: '12 months',
  };
}

export type ResendOutcome =
  | { ok: true; licenseId: string; email: string; sentAt: string }
  | {
      ok: false;
      licenseId: string;
      email?: string;
      status: number;
      code: 'not_found' | 'activated' | 'recently_emailed' | 'undeliverable' | 'send_failed';
      error: string;
    };

export interface ResendOptions {
  /**
   * Refuse if the seat was emailed (activation, resend or reminder) less than
   * this long ago. The single button uses a minute — it only guards against
   * double clicks. Bulk uses a day, so running it twice does not mail
   * everyone twice.
   */
  minGapMs: number;
  /**
   * Skip addresses Resend reported as bounced, complained or suppressed.
   * Bulk sets this: re-mailing dead or hostile inboxes in volume is what gets
   * a sending domain's reputation downgraded. The single button does not — an
   * admin resending to one address may have just fixed it.
   */
  skipUndeliverable?: boolean;
  /** Bulk passes one map for the whole run so branding is looked up once per partner. */
  brandingCache?: Map<string, PartnerBranding | null>;
}

export async function resendActivationEmail(
  supabase: SupabaseClient,
  actor: LicenseActor,
  licenseId: string,
  options: ResendOptions
): Promise<ResendOutcome> {
  const licenseResult = await loadManageableLicense(
    supabase,
    actor,
    licenseId,
    'resend the email for'
  );
  if (!licenseResult.ok) {
    return { ok: false, licenseId, status: licenseResult.status, code: 'not_found', error: licenseResult.error };
  }
  const { license } = licenseResult;

  if (license.is_activated) {
    return {
      ok: false, licenseId, email: license.email, status: 400, code: 'activated',
      error: 'License is already activated',
    };
  }

  if (
    options.skipUndeliverable &&
    license.email_status &&
    (UNDELIVERABLE_EMAIL_STATES as readonly string[]).includes(license.email_status) &&
    license.email_status !== 'failed' // our own send failure — retrying is the point
  ) {
    return {
      ok: false, licenseId, email: license.email, status: 409, code: 'undeliverable',
      error: `Skipped: the last email to this address ${license.email_status}`,
    };
  }

  const lastSentAt = license.last_reminder_sent_at || license.activation_email_sent_at;
  if (lastSentAt) {
    const elapsed = Date.now() - new Date(lastSentAt).getTime();
    if (elapsed < options.minGapMs) {
      const waitSeconds = Math.ceil((options.minGapMs - elapsed) / 1000);
      return {
        ok: false, licenseId, email: license.email, status: 429, code: 'recently_emailed',
        error: `An email was just sent to this address. Try again in ${waitSeconds}s.`,
      };
    }
  }

  // Branding: prefer the partner the license belongs to (a Moil admin may be
  // resending on behalf of another workspace), then the license owner's
  // partner, and finally the acting admin's own partner.
  const actorPartner = (actor.admin.partner as PartnerBranding | null) || null;
  let partnerInfo = actorPartner;
  const cache = options.brandingCache;

  if (license.partner_id && license.partner_id !== actorPartner?.id) {
    const key = `partner:${license.partner_id}`;
    if (cache?.has(key)) {
      partnerInfo = cache.get(key) ?? actorPartner;
    } else {
      const { data: licensePartner } = await supabase
        .from('partners')
        .select(PARTNER_BRANDING_COLUMNS)
        .eq('id', license.partner_id)
        .single();
      cache?.set(key, (licensePartner as PartnerBranding | null) ?? null);
      if (licensePartner) partnerInfo = licensePartner as PartnerBranding;
    }
  } else if (!license.partner_id && license.admin_id && license.admin_id !== actor.userId) {
    const key = `admin:${license.admin_id}`;
    if (cache?.has(key)) {
      partnerInfo = cache.get(key) ?? actorPartner;
    } else {
      const { data: ownerAdmin } = await supabase
        .from('admins')
        .select(`partner:partners(${PARTNER_BRANDING_COLUMNS})`)
        .eq('id', license.admin_id)
        .single();
      const ownerPartner = (ownerAdmin?.partner as PartnerBranding | null | undefined) ?? null;
      cache?.set(key, ownerPartner);
      if (ownerPartner) partnerInfo = ownerPartner;
    }
  }

  const partnerName = partnerInfo?.name || 'moil-partners';
  // Partner names are lowercase alphanumerics and spaces; hyphenate for the URL.
  const orgSlug = partnerName.replace(/\s+/g, '-');
  const activationUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://business.moilapp.com'}/register?licenseId=${license.id}&ref=moilPartners&org=${orgSlug}`;

  const emailResult = await sendLicenseActivationEmail({
    email: license.email,
    activationUrl,
    adminName: `${actor.admin.first_name} ${actor.admin.last_name}`,
    edc: buildEdcInfo(partnerInfo),
  });

  const sentAt = new Date().toISOString();

  if (!emailResult.success || !emailResult.messageId) {
    console.error('Failed to resend activation email:', emailResult.error);
    await supabase.from('licenses').update({ email_status: 'failed' }).eq('id', license.id);
    return {
      ok: false, licenseId, email: license.email, status: 500, code: 'send_failed',
      error: 'Failed to send email',
    };
  }

  // Logged separately because the update below OVERWRITES message_id —
  // without this row, opens of the previous email would have nowhere to go.
  await recordLicenseEmails(createAdminClient(), [
    { messageId: emailResult.messageId, licenseId: license.id, kind: 'activation', recipient: license.email },
  ]);

  const { count } = await supabase
    .from('licenses')
    .update(
      {
        message_id: emailResult.messageId,
        email_status: 'sent',
        activation_email_sent_at: sentAt,
        // A resend restarts the automatic reminder cycle.
        last_reminder_sent_at: null,
        reminder_count: 0,
      },
      { count: 'exact' }
    )
    .eq('id', license.id);

  // The email is already out, so this isn't worth failing over — but a
  // zero-row update means RLS rejected the write and the cooldown wasn't
  // recorded, which is worth seeing in the logs.
  if (count === 0) {
    console.warn(
      `Resent activation email for license ${license.id} but could not record the send (update blocked).`
    );
  }

  await logLicenseActivity(supabase, actor, {
    license,
    activityType: 'license_resend',
    description: `Resent activation email to ${license.email}`,
    metadata: { license_id: license.id, email: license.email },
  });

  return { ok: true, licenseId, email: license.email, sentAt };
}
