import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { sendLicenseActivationReminderEmail, type EdcEmailInfo } from '@/lib/email';

const REMINDER_INTERVAL_DAYS = 15;
const MAX_REMINDERS = 4;

interface DueLicense {
  id: string;
  email: string;
  admin_id: string | null;
  partner_id: string | null;
  activation_email_sent_at: string | null;
  last_reminder_sent_at: string | null;
  reminder_count: number;
  created_at: string;
}

interface PartnerRow {
  id: string;
  name: string | null;
  program_name: string | null;
  full_name: string | null;
  logo_url: string | null;
  logo_initial: string | null;
  primary_color: string | null;
  support_email: string | null;
  license_duration: number | null;
  features: { jobPosts?: number } | null;
}

function partnerToEdc(partner: PartnerRow): EdcEmailInfo {
  return {
    programName: partner.program_name || partner.name || 'Moil Partners',
    fullName: partner.full_name || partner.name || 'Moil Partners',
    logo: partner.logo_url || undefined,
    logoInitial:
      partner.logo_initial || partner.name?.charAt(0).toUpperCase() || 'M',
    primaryColor: partner.primary_color || '#5843BE',
    supportEmail: partner.support_email || 'support@moilapp.com',
    licenseDuration: partner.license_duration
      ? `${partner.license_duration} days`
      : '12 months',
    jobPosts: partner.features?.jobPosts,
  };
}

function buildActivationUrl(licenseId: string, partnerName: string | null) {
  const base =
    process.env.NEXT_PUBLIC_APP_URL || 'https://business.moilapp.com';
  const orgSlug = (partnerName || 'moil-partners').replace(/\s+/g, '-');
  return `${base}/register?licenseId=${licenseId}&ref=moilPartners&org=${orgSlug}`;
}

function authorizeCron(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return { ok: false, status: 500, error: 'CRON_SECRET not configured' };
  }
  const header = request.headers.get('authorization');
  if (header !== `Bearer ${expected}`) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  return { ok: true as const };
}

async function handle(request: NextRequest) {
  const auth = authorizeCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = createAdminClient();
  const now = new Date();
  const cutoffIso = new Date(
    now.getTime() - REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Two cohorts of "due" licenses, both unactivated + email_status='sent' + under cap:
  //   1. never reminded, original email sent ≥ 15 days ago
  //   2. last reminder sent ≥ 15 days ago
  const baseSelect =
    'id,email,admin_id,partner_id,activation_email_sent_at,last_reminder_sent_at,reminder_count,created_at';

  const { data: cohortA, error: errA } = await supabase
    .from('licenses')
    .select(baseSelect)
    .eq('is_activated', false)
    .eq('email_status', 'sent')
    .is('last_reminder_sent_at', null)
    .lt('reminder_count', MAX_REMINDERS)
    .lte('activation_email_sent_at', cutoffIso)
    .not('activation_email_sent_at', 'is', null);

  const { data: cohortB, error: errB } = await supabase
    .from('licenses')
    .select(baseSelect)
    .eq('is_activated', false)
    .eq('email_status', 'sent')
    .lt('reminder_count', MAX_REMINDERS)
    .lte('last_reminder_sent_at', cutoffIso)
    .not('last_reminder_sent_at', 'is', null);

  if (errA || errB) {
    console.error('send-reminders: query failed', errA, errB);
    return NextResponse.json(
      { error: 'Failed to fetch due licenses' },
      { status: 500 },
    );
  }

  const dueLicenses: DueLicense[] = [
    ...((cohortA || []) as DueLicense[]),
    ...((cohortB || []) as DueLicense[]),
  ];

  if (dueLicenses.length === 0) {
    return NextResponse.json({ processed: 0, sent: 0, failed: 0 });
  }

  // Batch-fetch partners for branding.
  const partnerIds = [
    ...new Set(dueLicenses.map((l) => l.partner_id).filter(Boolean) as string[]),
  ];
  const partnersById: Record<string, PartnerRow> = {};
  if (partnerIds.length > 0) {
    const { data: partners } = await supabase
      .from('partners')
      .select(
        'id,name,program_name,full_name,logo_url,logo_initial,primary_color,support_email,license_duration,features',
      )
      .in('id', partnerIds);
    if (partners) {
      for (const p of partners as PartnerRow[]) {
        partnersById[p.id] = p;
      }
    }
  }

  let sent = 0;
  let failed = 0;

  for (const license of dueLicenses) {
    const partner = license.partner_id ? partnersById[license.partner_id] : null;
    const edc = partner ? partnerToEdc(partner) : undefined;
    const reference =
      license.last_reminder_sent_at ||
      license.activation_email_sent_at ||
      license.created_at;
    const daysSinceAssigned = Math.max(
      1,
      Math.round(
        (now.getTime() - new Date(license.activation_email_sent_at || license.created_at).getTime()) /
          (24 * 60 * 60 * 1000),
      ),
    );
    const nextReminderNumber = license.reminder_count + 1;

    const result = await sendLicenseActivationReminderEmail({
      email: license.email,
      activationUrl: buildActivationUrl(license.id, partner?.name || null),
      daysSinceAssigned,
      reminderNumber: nextReminderNumber,
      edc,
    });

    if (!result.success) {
      failed += 1;
      console.error(
        `send-reminders: failed for license ${license.id}`,
        result.error,
      );
      continue;
    }

    const { error: updateError } = await supabase
      .from('licenses')
      .update({
        last_reminder_sent_at: new Date().toISOString(),
        reminder_count: nextReminderNumber,
      })
      .eq('id', license.id);

    if (updateError) {
      // Email went out but we couldn't record it — log loud, count as failed
      // so we notice. Worst case the next run sends a duplicate.
      failed += 1;
      console.error(
        `send-reminders: email sent but update failed for ${license.id}`,
        updateError,
      );
      continue;
    }

    await supabase.rpc('log_activity', {
      p_admin_id: license.admin_id,
      p_activity_type: 'license_reminder_sent',
      p_description: `Reminder #${nextReminderNumber} sent to ${license.email}`,
      p_metadata: {
        license_id: license.id,
        reminder_number: nextReminderNumber,
        days_since_assigned: daysSinceAssigned,
        reference_date: reference,
      },
    });

    sent += 1;
  }

  return NextResponse.json({
    processed: dueLicenses.length,
    sent,
    failed,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
