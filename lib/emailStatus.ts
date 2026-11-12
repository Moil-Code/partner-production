/**
 * `licenses.email_status` vocabulary.
 *
 * The add/resend routes write 'sent' (or 'failed' / 'skipped'). After that,
 * POST /api/licenses/email-status overwrites it with Resend's `last_event`
 * for the message: delivered, opened, clicked, bounced, complained,
 * delivery_delayed. So 'sent' is only the FIRST value a successfully sent
 * email holds, not the only one.
 *
 * Anything that asks "did the activation email go out?" must use
 * OUTBOUND_EMAIL_STATES, never `= 'sent'`. Matching 'sent' alone is how the
 * reminder cron silently stopped reminding every licensee whose email had been
 * delivered or opened as soon as someone loaded the dashboard (which syncs).
 */
export const OUTBOUND_EMAIL_STATES = [
  'sent',
  'delivered',
  'delivery_delayed',
  'opened',
  'clicked',
] as const;

/** Resend says it never arrived, or the recipient marked it as spam. */
export const UNDELIVERABLE_EMAIL_STATES = ['bounced', 'complained', 'failed'] as const;

/**
 * Funnel stage, highest first. A status implies every stage below it: a
 * clicked email was also opened and delivered.
 */
export function emailFunnelStage(
  status: string | null | undefined,
): 'clicked' | 'opened' | 'delivered' | 'sent' | 'undeliverable' | 'none' {
  switch (status) {
    case 'clicked':
      return 'clicked';
    case 'opened':
      return 'opened';
    case 'delivered':
      return 'delivered';
    case 'sent':
    case 'delivery_delayed':
      return 'sent';
    case 'bounced':
    case 'complained':
    case 'failed':
      return 'undeliverable';
    default:
      return 'none';
  }
}

/**
 * How many emails went to this licensee in the CURRENT cycle: the activation
 * email plus automatic reminders. A manual resend restarts the cycle (it
 * resets `reminder_count`), so this is a floor, not a lifetime total.
 */
export function emailsSentCount(license: {
  activation_email_sent_at?: string | null;
  email_status?: string | null;
  reminder_count?: number | null;
}): number {
  const stage = emailFunnelStage(license.email_status);
  const originalWentOut =
    !!license.activation_email_sent_at ||
    (stage !== 'none' && license.email_status !== 'failed');
  return (originalWentOut ? 1 : 0) + (license.reminder_count || 0);
}
