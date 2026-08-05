import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Shared authorization for the license mutation routes (resend / update-email /
 * delete / remove).
 *
 * Every one of those routes needs the same three questions answered:
 *   1. Is the caller a logged-in admin?
 *   2. Is the caller a Moil admin (cross-partner access) or scoped to a team?
 *   3. Does the license they named fall inside that scope?
 *
 * They used to answer them inline, and drifted: some granted Moil admins
 * cross-partner access and some didn't, so the same button worked on one page
 * and 404'd on another. Route handlers should go through the helpers here.
 */

export const LICENSE_ADMIN_COLUMNS =
  'id, email, first_name, last_name, global_role, partner_id';

export interface LicenseActorAdmin {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  global_role: string | null;
  partner_id: string | null;
  [key: string]: unknown;
}

export interface LicenseActor {
  userId: string;
  admin: LicenseActorAdmin;
  /** Moil staff: cross-partner access to every license. */
  isMoilAdmin: boolean;
  /** The team the caller belongs to, when they are not solo. */
  teamId: string | null;
}

/**
 * A `licenses` row. The named fields are the ones the mutation routes read;
 * the index signature keeps `select('*')` rows usable without restating the
 * whole table.
 */
export interface LicenseRecord {
  id: string;
  email: string;
  is_activated: boolean;
  team_id: string | null;
  admin_id: string | null;
  partner_id: string | null;
  message_id?: string | null;
  email_status?: string | null;
  activation_email_sent_at?: string | null;
  last_reminder_sent_at?: string | null;
  reminder_count?: number | null;
  [key: string]: unknown;
}

export interface LicenseAccessDenied {
  ok: false;
  error: string;
  status: number;
}

export type LicenseActorResult =
  | { ok: true; actor: LicenseActor }
  | LicenseAccessDenied;

export type LicenseResult =
  | { ok: true; license: LicenseRecord }
  | LicenseAccessDenied;

/**
 * Moil staff are identified by `global_role`, with an `@moilapp.com` email
 * fallback — the same rule `lib/stores/authStore.ts` applies on the client.
 */
export function isMoilAdminRecord(admin: {
  email?: string | null;
  global_role?: string | null;
}): boolean {
  return (
    admin.global_role === 'moil_admin' ||
    admin.email?.toLowerCase().endsWith('@moilapp.com') === true
  );
}

/**
 * Resolve the caller into a license actor: their admin record, whether they are
 * Moil staff, and the team scoping their access.
 *
 * `adminSelect` lets a caller widen the `admins` projection (e.g. resend joins
 * partner branding); it must still include {@link LICENSE_ADMIN_COLUMNS}.
 */
export async function resolveLicenseActor(
  supabase: SupabaseClient,
  options: { adminSelect?: string } = {}
): Promise<LicenseActorResult> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: 'Unauthorized. Please login.', status: 401 };
  }

  const { data: admin, error: adminError } = await supabase
    .from('admins')
    .select(options.adminSelect || LICENSE_ADMIN_COLUMNS)
    .eq('id', user.id)
    .maybeSingle();

  if (adminError || !admin) {
    return {
      ok: false,
      error: 'Access denied. Admin account required.',
      status: 403,
    };
  }

  const adminRecord = admin as unknown as LicenseActorAdmin;

  // A solo admin has no row here; that is not an error.
  const { data: teamMember } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('admin_id', user.id)
    .maybeSingle();

  return {
    ok: true,
    actor: {
      userId: user.id,
      admin: adminRecord,
      isMoilAdmin: isMoilAdminRecord(adminRecord),
      teamId: teamMember?.team_id ?? null,
    },
  };
}

/**
 * Load a license the actor is allowed to mutate.
 *
 * Scope: Moil admins reach every license, team members reach their team's
 * licenses, and solo admins reach only the ones they created. Out-of-scope
 * licenses report as 404 so this can't be used to probe for other workspaces'
 * license IDs.
 */
export async function loadManageableLicense(
  supabase: SupabaseClient,
  actor: LicenseActor,
  licenseId: string,
  action: string,
  select = '*'
): Promise<LicenseResult> {
  let query = supabase.from('licenses').select(select).eq('id', licenseId);

  if (actor.isMoilAdmin) {
    // Cross-partner access — no additional scoping.
  } else if (actor.teamId) {
    query = query.eq('team_id', actor.teamId);
  } else {
    query = query.eq('admin_id', actor.userId);
  }

  const { data: license, error } = await query.maybeSingle();

  if (error || !license) {
    return {
      ok: false,
      error: `License not found or you do not have permission to ${action} it`,
      status: 404,
    };
  }

  return { ok: true, license: license as unknown as LicenseRecord };
}

/**
 * Record the mutation on the team's activity feed. Best-effort: a failed log
 * must never fail the mutation that already happened.
 *
 * Prefers the license's own team so a Moil admin acting on another workspace's
 * license writes into that workspace's feed rather than their own.
 */
export async function logLicenseActivity(
  supabase: SupabaseClient,
  actor: LicenseActor,
  params: {
    license: { team_id?: string | null };
    activityType: string;
    description: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const teamId = params.license.team_id || actor.teamId;
  if (!teamId) return;

  try {
    await supabase.rpc('log_activity', {
      p_team_id: teamId,
      p_admin_id: actor.userId,
      p_activity_type: params.activityType,
      p_description: params.description,
      p_metadata: params.metadata ?? {},
    });
  } catch (error) {
    console.error('Failed to log license activity:', error);
  }
}
