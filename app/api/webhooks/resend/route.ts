import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifySvixSignature } from '@/lib/webhookSignature';

/**
 * Resend webhook: delivery, open, click, bounce and complaint events.
 *
 * PUBLIC (middleware allowlist) — Resend cannot log in. The Svix signature is
 * the only thing standing between this route and anyone who wants to mark
 * seats as opened, so it FAILS CLOSED: no RESEND_WEBHOOK_SECRET, no processing
 * (503, which Resend retries — events are not lost while it is being set up).
 *
 * Everything else is in SQL (database/add_email_tracking.sql,
 * apply_resend_event): dedupe on svix-id, match the message to a seat, move
 * its counters forward. Doing it in one function call keeps a retry or two
 * concurrent deliveries from double-counting an open.
 *
 * Response codes are chosen for Resend's retry behaviour: 2xx for anything we
 * have handled or deliberately ignore, 4xx for a request that will never be
 * valid (bad signature), 5xx only when a retry could succeed.
 */

// Resend event type → our stored name. Anything else (email.scheduled,
// email.received for inbound mail, future types) is acknowledged and ignored.
const TRACKED_EVENTS: Record<string, string> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delivery_delayed',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.failed': 'failed',
  'email.suppressed': 'suppressed',
};

interface ResendWebhookPayload {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    created_at?: string;
  };
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[webhooks/resend] RESEND_WEBHOOK_SECRET is not set; refusing event.');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  const rawBody = await request.text();
  const svixId = request.headers.get('svix-id');
  const check = verifySvixSignature(secret, rawBody, {
    id: svixId,
    timestamp: request.headers.get('svix-timestamp'),
    signature: request.headers.get('svix-signature'),
  });
  if (!check.ok) {
    console.warn('[webhooks/resend] rejected:', check.reason);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: ResendWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Signed but unparseable — retrying will not fix it.
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType = payload.type ? TRACKED_EVENTS[payload.type] : undefined;
  if (!eventType) {
    return NextResponse.json({ ignored: payload.type ?? 'unknown' }, { status: 200 });
  }

  const to = payload.data?.to;
  const recipient = (Array.isArray(to) ? to[0] : to) ?? null;
  const occurredAt = payload.created_at || payload.data?.created_at || new Date().toISOString();

  // Service role: this is a server-to-server call with no user session, and
  // the signature above is the authorisation.
  const supabase = createAdminClient();
  const { data: outcome, error } = await supabase.rpc('apply_resend_event', {
    p_svix_id: svixId!,
    p_message_id: payload.data?.email_id ?? null,
    p_event_type: eventType,
    p_recipient: recipient,
    p_occurred_at: occurredAt,
    p_payload: payload,
  });

  if (error) {
    // 500 so Resend retries. Dedupe on svix-id makes the retry safe even if
    // part of this attempt landed.
    console.error('[webhooks/resend] apply_resend_event failed:', error);
    return NextResponse.json({ error: 'Failed to record event' }, { status: 500 });
  }

  return NextResponse.json({ result: outcome }, { status: 200 });
}
