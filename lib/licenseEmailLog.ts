import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Record emails sent about license seats, so Resend webhook events
 * (/api/webhooks/resend) can be attributed to the seat and counted.
 *
 * `licenses.message_id` alone cannot do this: it holds only the LATEST
 * message for a seat — a resend overwrites it, and reminders never set it —
 * so every earlier email's opens and bounces had nowhere to land.
 *
 * Best-effort by design. The email has already gone out; failing the request
 * over its bookkeeping would make the operator retry and send it twice. A
 * missed row is also recoverable: the webhook falls back to
 * licenses.message_id for activation emails.
 *
 * Needs the SERVICE-ROLE client — only it may execute record_license_emails
 * (database/add_email_tracking.sql).
 */

export type LicenseEmailKind = 'activation' | 'claim' | 'activated' | 'reminder';

export interface LicenseEmailSend {
  messageId: string | null | undefined;
  licenseId: string | null | undefined;
  kind: LicenseEmailKind;
  recipient?: string | null;
}

export async function recordLicenseEmails(
  adminSupabase: SupabaseClient,
  sends: LicenseEmailSend[],
): Promise<void> {
  const rows = sends
    .filter((s) => s.messageId && s.licenseId)
    .map((s) => ({
      message_id: s.messageId,
      license_id: s.licenseId,
      kind: s.kind,
      recipient: s.recipient ? s.recipient.toLowerCase() : null,
    }));
  if (rows.length === 0) return;

  try {
    const { error } = await adminSupabase.rpc('record_license_emails', { p_rows: rows });
    if (error) console.error('[licenseEmailLog] record_license_emails failed:', error);
  } catch (err) {
    console.error('[licenseEmailLog] record_license_emails threw:', err);
  }
}
