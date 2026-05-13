-- ============================================
-- ADD REMINDER TRACKING TO LICENSES
-- Run this in Supabase SQL Editor
-- ============================================
-- Adds columns + index used by /api/licenses/send-reminders
-- (cron-driven 15-day reminder loop, capped at 4 reminders).
--
-- Reference date for "days since last contact":
--   coalesce(last_reminder_sent_at, activation_email_sent_at)
-- ============================================

ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS activation_email_sent_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at    TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS reminder_count           INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.licenses.activation_email_sent_at IS
  'When the original activation email was successfully sent. Populated alongside email_status=sent.';
COMMENT ON COLUMN public.licenses.last_reminder_sent_at IS
  'When the most recent activation reminder was sent. NULL until the first reminder.';
COMMENT ON COLUMN public.licenses.reminder_count IS
  'Number of activation reminders sent. Cron stops sending once this reaches MAX_REMINDERS (4).';

-- One-time backfill: existing licenses with email_status=sent get
-- activation_email_sent_at = created_at as an approximation. Going forward
-- the add/resend endpoints write the precise timestamp.
UPDATE public.licenses
SET activation_email_sent_at = created_at
WHERE activation_email_sent_at IS NULL
  AND email_status = 'sent';

-- Partial index for the cron's "due for a reminder" lookup.
-- Only indexes rows the cron actually scans (unactivated + email sent).
CREATE INDEX IF NOT EXISTS idx_licenses_reminders_due
  ON public.licenses (activation_email_sent_at, last_reminder_sent_at, reminder_count)
  WHERE is_activated = FALSE AND email_status = 'sent';
