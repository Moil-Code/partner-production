-- ============================================
-- REMINDER INDEX: MATCH EVERY OUTBOUND EMAIL STATE
-- Run this in Supabase SQL Editor
-- ============================================
-- /api/licenses/send-reminders used to select email_status = 'sent' only.
-- The Resend status sync rewrites 'sent' to delivered/opened/clicked, so
-- those licensees silently stopped getting reminders. The cron now matches
-- every outbound state (lib/emailStatus.ts OUTBOUND_EMAIL_STATES); this
-- rebuilds the partial index from add_reminder_tracking.sql with the same
-- predicate so the planner can still use it.
-- ============================================

DROP INDEX IF EXISTS public.idx_licenses_reminders_due;

CREATE INDEX IF NOT EXISTS idx_licenses_reminders_due
  ON public.licenses (activation_email_sent_at, last_reminder_sent_at, reminder_count)
  WHERE is_activated = FALSE
    AND email_status IN ('sent', 'delivered', 'delivery_delayed', 'opened', 'clicked');
