/**
 * PP-LICENSE-1: issue licences through issue_licenses
 * (database/add_license_issue_outbox.sql), which checks seats under a lock on
 * the team, inserts the licences and emits their outbox events in ONE
 * transaction.
 *
 * Mode (env LICENSE_ISSUE_OUTBOX, default 'shadow'):
 *   off     the routes insert and send exactly as before; nothing is emitted.
 *   shadow  insert through the RPC (seat lock + events, sender 'legacy'); the
 *           route still activates and emails inline; the drain only checks
 *           the route finished.
 *   on      sender per licence from the canary (LICENSE_ISSUE_OUTBOX_CANARY,
 *           0..100, default 0, keyed on the licence id): 'outbox' licences are
 *           activated and emailed only by the drain; the route skips both.
 *
 * Inert until the migration is applied: the RPC answers "function not found",
 * this returns 'unavailable' and the route inserts and sends as before. Any
 * other refused statement ('rpc_failed') also falls back to the inline insert,
 * since a failed statement wrote nothing; only an unknown outcome (the call
 * threw) answers 500, so a licence is never inserted twice.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingObject, parseCanary, parseFlowMode, type FlowMode, type Sender } from './rules.ts';

export const LICENSE_ISSUE_MODE_ENV = 'LICENSE_ISSUE_OUTBOX';
export const LICENSE_ISSUE_CANARY_ENV = 'LICENSE_ISSUE_OUTBOX_CANARY';
const DEFAULT_MODE: FlowMode = 'shadow';

let warnedMode = false;
let warnedMissing = false;

export function licenseIssueConfig(env: Record<string, string | undefined> = process.env): {
  mode: FlowMode;
  canary: number;
} {
  const parsed = parseFlowMode(env[LICENSE_ISSUE_MODE_ENV], DEFAULT_MODE);
  if (!parsed.recognised && !warnedMode) {
    warnedMode = true;
    console.warn(`[outbox] ${LICENSE_ISSUE_MODE_ENV} is not off|shadow|on; treating it as off.`);
  }
  return { mode: parsed.mode, canary: parseCanary(env[LICENSE_ISSUE_CANARY_ENV]) };
}

export interface IssueRow {
  id: string;
  email: string;
  plan_tier: string | null;
  billing_cycle: string | null;
  months: number | null;
  sender: Sender;
}

export interface IssuedLicense {
  id: string;
  email: string;
  created_at: string;
  is_activated: boolean;
}

export type IssueResult =
  | { status: 'ok'; licenses: IssuedLicense[] }
  | { status: 'no_seats'; available: number }
  | { status: 'exists'; emails: string[] }
  | { status: 'unavailable' }
  /** The statement failed and rolled back: nothing was written. */
  | { status: 'rpc_failed' }
  /** Unknown whether it committed (the call itself threw). */
  | { status: 'error' };

export async function issueLicensesViaOutbox(
  admin: SupabaseClient,
  args: { adminId: string; teamId: string | null; partnerId: string | null; rows: IssueRow[] },
): Promise<IssueResult> {
  let data: unknown;
  let error: { code?: string; message?: string } | null;
  try {
    ({ data, error } = await admin.rpc('issue_licenses', {
      p_admin_id: args.adminId,
      p_team_id: args.teamId,
      p_partner_id: args.partnerId,
      p_rows: args.rows,
    }));
  } catch (err) {
    console.error('[outbox] issue_licenses threw:', err instanceof Error ? err.message : 'unknown');
    return { status: 'error' };
  }

  if (error) {
    if (isMissingObject(error)) {
      if (!warnedMissing) {
        warnedMissing = true;
        console.warn(
          `[outbox] issue_licenses not installed (code ${error.code}); the add routes ` +
            'insert inline as before. Apply database/add_outbox.sql then database/add_license_issue_outbox.sql.',
        );
      }
      return { status: 'unavailable' };
    }
    // A Postgres SQLSTATE or a PostgREST refusal means the statement failed
    // and rolled back, so nothing was written and the route can insert inline
    // as before. Anything else (a gateway timeout, a dropped connection) may
    // have committed: answer 500 rather than risk a second licence.
    const code = String(error.code ?? '');
    if (/^[0-9A-Z]{5}$/.test(code) || code.startsWith('PGRST')) {
      console.error(`[outbox] issue_licenses failed (${code}); inserting inline`);
      return { status: 'rpc_failed' };
    }
    console.error('[outbox] issue_licenses outcome unknown (no SQLSTATE)');
    return { status: 'error' };
  }

  const r = (data ?? {}) as {
    status?: string;
    licenses?: IssuedLicense[];
    available?: number;
    emails?: string[];
  };
  if (r.status === 'ok' && Array.isArray(r.licenses)) return { status: 'ok', licenses: r.licenses };
  if (r.status === 'no_seats') return { status: 'no_seats', available: Number(r.available) || 0 };
  if (r.status === 'exists') return { status: 'exists', emails: Array.isArray(r.emails) ? r.emails : [] };
  console.error('[outbox] issue_licenses answered an unknown shape');
  return { status: 'error' };
}
