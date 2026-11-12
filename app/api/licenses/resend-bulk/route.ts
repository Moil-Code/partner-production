import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveLicenseActor, LICENSE_ADMIN_COLUMNS } from '@/lib/licenses/access';
import {
  resendActivationEmail,
  PARTNER_BRANDING_COLUMNS,
  type PartnerBranding,
} from '@/lib/licenses/resendActivation';

/**
 * Re-send activation emails to many pending seats.
 *
 * Body: { licenseIds: string[] } — at most MAX_PER_REQUEST. The dashboard
 * sends the list in chunks and shows progress between them: every email goes
 * through the 2 req/s queue in lib/email.ts, so one request for hundreds of
 * seats would outlive the serverless function's time limit and leave the
 * caller not knowing which ones went out.
 *
 * Same access rules as the single resend (a partner admin can only reach their
 * own team's seats; Moil staff can reach any), and per seat it is the same
 * code path. Two things differ, both deliberate:
 *   - seats emailed in the last BULK_MIN_GAP_MS are skipped, so running a bulk
 *     resend twice — or after the daily reminder cron — does not mail people
 *     twice in a day;
 *   - addresses that bounced or complained are skipped. Mass-mailing them is
 *     what downgrades a sending domain's reputation, and it hurts delivery for
 *     every partner, not just this one.
 *
 * Partial success is the normal case, so this always answers 200 with a
 * per-seat outcome rather than failing the batch on one bad address.
 */

const MAX_PER_REQUEST = 25;
const BULK_MIN_GAP_MS = 24 * 60 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const licenseIds: unknown = body?.licenseIds;

    if (!Array.isArray(licenseIds) || licenseIds.length === 0) {
      return NextResponse.json({ error: 'licenseIds must be a non-empty array' }, { status: 400 });
    }
    if (licenseIds.length > MAX_PER_REQUEST) {
      return NextResponse.json(
        { error: `At most ${MAX_PER_REQUEST} licenses per request; send the rest in further requests.` },
        { status: 400 }
      );
    }
    if (!licenseIds.every((id) => typeof id === 'string' && UUID_RE.test(id))) {
      return NextResponse.json({ error: 'Every licenseId must be a UUID' }, { status: 400 });
    }

    const supabase = await createClient();
    const actorResult = await resolveLicenseActor(supabase, {
      adminSelect: `${LICENSE_ADMIN_COLUMNS}, partner:partners(${PARTNER_BRANDING_COLUMNS})`,
    });
    if (!actorResult.ok) {
      return NextResponse.json({ error: actorResult.error }, { status: actorResult.status });
    }

    const brandingCache = new Map<string, PartnerBranding | null>();
    const results = [];
    // Sequential on purpose: the email queue serialises sends anyway, and one
    // at a time keeps a failure from leaving several sends in an unknown state.
    for (const licenseId of [...new Set(licenseIds as string[])]) {
      const outcome = await resendActivationEmail(supabase, actorResult.actor, licenseId, {
        minGapMs: BULK_MIN_GAP_MS,
        skipUndeliverable: true,
        brandingCache,
      });
      results.push(
        outcome.ok
          ? { licenseId, email: outcome.email, outcome: 'sent' as const }
          : {
              licenseId,
              email: outcome.email ?? null,
              outcome: outcome.code === 'send_failed' ? ('failed' as const) : ('skipped' as const),
              reason: outcome.code,
            }
      );
    }

    return NextResponse.json(
      {
        results,
        sent: results.filter((r) => r.outcome === 'sent').length,
        skipped: results.filter((r) => r.outcome === 'skipped').length,
        failed: results.filter((r) => r.outcome === 'failed').length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Bulk resend error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
