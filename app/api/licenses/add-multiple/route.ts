import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import {
  sendBatchLicenseActivationEmails,
  sendBatchLicenseClaimEmails,
  sendBatchLicenseActivatedEmails,
  type EdcEmailInfo,
} from '@/lib/email';

// All partner-issued licenses grant exactly this plan.
const PARTNER_PLAN_DEFAULTS = { plan: 'standard', billingCycle: 'yearly' };
const PARTNER_PLAN_DISPLAY = 'Standard Annual';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { emails } = body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json(
        { error: 'Valid email addresses are required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized. Please login.' }, { status: 401 });
    }

    const { data: adminData, error: adminError } = await supabase
      .from('admins')
      .select('*, partner:partners(id, name, program_name, logo_url, logo_initial, primary_color, support_email)')
      .eq('id', user.id)
      .single();

    if (adminError || !adminData) {
      return NextResponse.json({ error: 'Access denied. Admin account required.' }, { status: 403 });
    }

    const partnerInfo = adminData.partner as {
      id: string;
      name: string;
      program_name?: string;
      logo_url?: string;
      logo_initial?: string;
      primary_color?: string;
      support_email?: string;
    } | null;

    const partnerName = partnerInfo?.program_name || partnerInfo?.name || 'Moil Partners';
    const orgSlug = (partnerInfo?.name || 'moil-partners').replace(/\s+/g, '-');

    const edcInfo: EdcEmailInfo = {
      programName: partnerInfo?.program_name || partnerInfo?.name || 'Moil Partners',
      fullName: partnerInfo?.name || 'Moil Partners',
      logo: partnerInfo?.logo_url || undefined,
      logoInitial: partnerInfo?.logo_initial || partnerInfo?.name?.charAt(0) || 'M',
      primaryColor: partnerInfo?.primary_color || '#5843BE',
      supportEmail: partnerInfo?.support_email || 'support@moilapp.com',
      licenseDuration: '12 months',
    };

    const { data: teamMember } = await supabase
      .from('team_members')
      .select('team_id, team:teams(id, purchased_license_count)')
      .eq('admin_id', user.id)
      .single();

    const teamId = teamMember?.team_id;
    const team = teamMember?.team as unknown as { id: string; purchased_license_count: number } | null;

    // Team capacity check
    let availableLicenses = Infinity;
    if (teamId && team) {
      const { count: assignedCount } = await supabase
        .from('licenses')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId);

      availableLicenses = (team.purchased_license_count || 0) - (assignedCount || 0);
      if (availableLicenses <= 0) {
        return NextResponse.json(
          { error: 'No available licenses. Please purchase more licenses.' },
          { status: 400 }
        );
      }
      if (emails.length > availableLicenses) {
        return NextResponse.json(
          { error: `Only ${availableLicenses} license(s) available. You're trying to add ${emails.length}.` },
          { status: 400 }
        );
      }
    }

    const parsedEmails = emails
      .map((e: string) => e.trim().toLowerCase())
      .filter((e: string) => e && e.includes('@'));

    const invalidEmails = emails.filter((e: string) => {
      const t = e.trim().toLowerCase();
      return !t || !t.includes('@');
    });

    // Global duplicate check (batch)
    const adminSupabase = createAdminClient();
    const { data: existingLicenses } = await adminSupabase
      .from('licenses')
      .select('email')
      .in('email', parsedEmails);

    const licensedEmails = new Set(existingLicenses?.map((l: { email: string }) => l.email) || []);
    const emailsWithGlobalLicenses = parsedEmails.filter((e: string) => licensedEmails.has(e));

    if (emailsWithGlobalLicenses.length > 0) {
      return NextResponse.json(
        {
          error: `The following email(s) already have licenses allocated: ${emailsWithGlobalLicenses.join(', ')}. If this is a mistake, please contact cs@moilapp.com`,
          emailsWithLicenses: emailsWithGlobalLicenses,
        },
        { status: 400 }
      );
    }

    // Per-admin/team duplicate check
    const existingChecks = await Promise.all(
      parsedEmails.map(async (email: string) => {
        let q = supabase.from('licenses').select('id').eq('email', email);
        q = teamId ? q.eq('team_id', teamId) : q.eq('admin_id', user.id);
        const { data } = await q.single();
        return { email, exists: !!data };
      })
    );

    const newEmails = existingChecks.filter((c) => !c.exists).map((c) => c.email);
    const existingEmails = existingChecks.filter((c) => c.exists).map((c) => c.email);

    if (newEmails.length === 0) {
      return NextResponse.json(
        { message: 'All provided emails already have licenses.', results: { success: 0, failed: existingEmails.length, errors: existingEmails.map((e) => `License already exists for: ${e}`) } },
        { status: 200 }
      );
    }

    // Insert all new license rows first so we can pass licenseIds to the Moil backend.
    const { data: insertedLicenses, error: insertError } = await supabase
      .from('licenses')
      .insert(
        newEmails.map((email) => ({
          email,
          admin_id: user.id,
          business_name: '',
          business_type: '',
          is_activated: false,
          team_id: teamId || null,
          performed_by: user.id,
        }))
      )
      .select();

    if (insertError) {
      console.error('Batch insert error:', insertError);
      return NextResponse.json({ error: `Failed to insert licenses: ${insertError.message}` }, { status: 500 });
    }

    type InsertedLicense = { id: string; email: string; is_activated: boolean; created_at: string };
    const licenseByEmail = new Map<string, InsertedLicense>(
      ((insertedLicenses || []) as InsertedLicense[]).map((l) => [l.email, l])
    );

    // Call Moil backend once for the entire batch.
    type MoilResult = { email: string; license_status: string; has_account?: boolean };
    const moilResultByEmail = new Map<string, MoilResult>();

    try {
      if (process.env.NEXT_PUBLIC_QC_API_KEY && newEmails.length > 0) {
        const resp = await fetch(
          `${process.env.NEXT_PUBLIC_MOIL_PAYMENT_ACTIVATION}/api/employer/activate_license`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': process.env.NEXT_PUBLIC_QC_API_KEY,
            },
            body: JSON.stringify({
              emails: newEmails.map((email) => ({
                email,
                licenseId: licenseByEmail.get(email)?.id,
              })),
              defaults: PARTNER_PLAN_DEFAULTS,
              source: partnerInfo?.name || 'moil',
              requestedBy: user.id,
            }),
          }
        );

        if (resp.ok) {
          const data = await resp.json();
          if (data.data?.results && Array.isArray(data.data.results)) {
            for (const r of data.data.results as MoilResult[]) {
              moilResultByEmail.set(r.email, r);
            }
          }
        }
      }
    } catch (err) {
      console.error('Moil activate_license batch call failed (non-fatal):', err);
    }

    // Bucket emails by outcome for targeted email dispatch.
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://business.moilapp.com'}/login`;
    const adminName = `${adminData.first_name} ${adminData.last_name}`;

    const toActivationEmail: Array<{ email: string; licenseId: string; activationUrl: string }> = [];
    const toClaimEmail: Array<{ email: string; loginUrl: string; partnerName: string; edc: EdcEmailInfo }> = [];
    const toActivatedEmail: Array<{ email: string; loginUrl: string; partnerName: string; planName: string; edc: EdcEmailInfo }> = [];
    const alreadyHandled = new Set<string>();

    for (const email of newEmails) {
      const moil = moilResultByEmail.get(email);
      const licenseId = licenseByEmail.get(email)?.id;
      if (!licenseId) continue;

      const status = moil?.license_status;

      if (status === 'activated') {
        toActivatedEmail.push({ email, loginUrl, partnerName, planName: PARTNER_PLAN_DISPLAY, edc: edcInfo });
        alreadyHandled.add(email);
      } else if (status === 'pending_invite' && moil?.has_account === true) {
        toClaimEmail.push({ email, loginUrl, partnerName, edc: edcInfo });
        alreadyHandled.add(email);
      } else if (status === 'already_assigned' || status === 'blocked_downgrade') {
        alreadyHandled.add(email);
      } else {
        // No Moil account or call failed → standard activation email
        toActivationEmail.push({
          email,
          licenseId,
          activationUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://business.moilapp.com'}/register?licenseId=${licenseId}&ref=moilPartners&org=${orgSlug}`,
        });
      }
    }

    // Mark already-active licenses in Supabase
    const immediatelyActive = [...alreadyHandled].filter((e) => {
      const s = moilResultByEmail.get(e)?.license_status;
      return s === 'activated' || s === 'already_assigned' || s === 'blocked_downgrade';
    });
    if (immediatelyActive.length > 0) {
      await supabase
        .from('licenses')
        .update({ is_activated: true, email_status: 'skipped', activated_at: new Date().toISOString() })
        .in('id', immediatelyActive.map((e) => licenseByEmail.get(e)?.id).filter(Boolean) as string[]);
    }

    // Dispatch emails in parallel (each batch respects the queue rate limit internally)
    const [activationResults, claimResults, activatedResults] = await Promise.all([
      toActivationEmail.length > 0
        ? sendBatchLicenseActivationEmails({ licenses: toActivationEmail, adminName, adminEmail: adminData.email, edc: edcInfo })
        : Promise.resolve({ results: [], sent: 0, failed: 0 }),
      toClaimEmail.length > 0
        ? sendBatchLicenseClaimEmails(toClaimEmail)
        : Promise.resolve({ results: [], sent: 0, failed: 0 }),
      toActivatedEmail.length > 0
        ? sendBatchLicenseActivatedEmails(toActivatedEmail)
        : Promise.resolve({ results: [], sent: 0, failed: 0 }),
    ]);

    // Persist email tracking for all sent emails
    const allEmailResults = [
      ...activationResults.results.map((r) => ({ ...r, licenseId: licenseByEmail.get(r.email)?.id })),
      ...claimResults.results.map((r) => ({ ...r, licenseId: licenseByEmail.get(r.email)?.id })),
      ...activatedResults.results.map((r) => ({ ...r, licenseId: licenseByEmail.get(r.email)?.id })),
    ];

    if (allEmailResults.length > 0) {
      await Promise.all(
        allEmailResults.map(async (r) => {
          if (!r.licenseId) return;
          await supabase
            .from('licenses')
            .update({
              email_status: r.success ? 'sent' : 'failed',
              ...(r.success && r.messageId ? { message_id: r.messageId } : {}),
            })
            .eq('id', r.licenseId);
        })
      );
    }

    if (teamMember?.team_id && (insertedLicenses?.length ?? 0) > 0) {
      await supabase.rpc('log_activity', {
        p_team_id: teamMember.team_id,
        p_admin_id: user.id,
        p_activity_type: 'license_added',
        p_description: `Added ${insertedLicenses!.length} license(s)`,
        p_metadata: { count: insertedLicenses!.length },
      });
    }

    const totalEmailsSent = activationResults.sent + claimResults.sent + activatedResults.sent;

    return NextResponse.json(
      {
        message: `Processed ${emails.length} emails: ${insertedLicenses?.length || 0} licenses added, ${totalEmailsSent} emails sent, ${existingEmails.length + invalidEmails.length} failed`,
        results: {
          success: insertedLicenses?.length || 0,
          failed: existingEmails.length + invalidEmails.length,
          emailsSent: totalEmailsSent,
          errors: [
            ...invalidEmails.map((e: string) => `Invalid email format: ${e}`),
            ...existingEmails.map((e: string) => `License already exists for: ${e}`),
          ],
          licenses: ((insertedLicenses || []) as InsertedLicense[]).map((l) => ({
            id: l.id,
            email: l.email,
            moilStatus: moilResultByEmail.get(l.email)?.license_status || 'pending',
            createdAt: l.created_at,
          })),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Add multiple licenses error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
