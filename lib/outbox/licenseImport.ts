/**
 * PP-LICENSE-2: the CSV import (/api/licenses/import) through the outbox.
 *
 * issue_import_licenses (database/add_license_import_outbox.sql) re-checks
 * seats under the team lock, inserts the rows and emits their outbox events in
 * ONE transaction, like issue_licenses does for /add. What a person receives
 * does NOT change: the import sends the activation ("register") email to every
 * licence the main API did not answer 'activated', whether or not the person
 * already has a Moil account, and it activates only when the caller sent plan
 * defaults (the partner CSV import sends none, so it never activates).
 *
 * Mode (env LICENSE_IMPORT_OUTBOX, default 'shadow'), its own dial so the
 * import is cut over apart from /add:
 *   off     the route activates, inserts and emails exactly as before.
 *   shadow  insert through the RPC (seat lock + events, every sender
 *           'legacy'); the route still activates and emails inline; the drain
 *           only checks the route finished.
 *   on      sender per licence from the canary (LICENSE_IMPORT_OUTBOX_CANARY,
 *           0..100, default 0, keyed on the licence id): 'outbox' licences are
 *           activated and emailed only by the drain; the route skips both.
 *
 * An import larger than IMPORT_RPC_MAX rows, an RPC that is not installed and
 * a refused statement all fall back to the inline path (every licence
 * 'legacy'); only an unknown outcome answers 500, so nothing is inserted twice.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { callIssueRpc, type IssueResult } from './licenseIssue.ts';
import { decideSender, parseCanary, parseFlowMode, type FlowMode, type Sender } from './rules.ts';

export const LICENSE_IMPORT_MODE_ENV = 'LICENSE_IMPORT_OUTBOX';
export const LICENSE_IMPORT_CANARY_ENV = 'LICENSE_IMPORT_OUTBOX_CANARY';
/** The RPC's own bound (one transaction). Bigger imports stay inline, as today. */
export const IMPORT_RPC_MAX = 1000;
const DEFAULT_MODE: FlowMode = 'shadow';

let warnedMode = false;

export function licenseImportConfig(env: Record<string, string | undefined> = process.env): {
  mode: FlowMode;
  canary: number;
} {
  const parsed = parseFlowMode(env[LICENSE_IMPORT_MODE_ENV], DEFAULT_MODE);
  if (!parsed.recognised && !warnedMode) {
    warnedMode = true;
    console.warn(`[outbox] ${LICENSE_IMPORT_MODE_ENV} is not off|shadow|on; treating it as off.`);
  }
  return { mode: parsed.mode, canary: parseCanary(env[LICENSE_IMPORT_CANARY_ENV]) };
}

export interface ImportItem {
  id: string;
  /** As typed in the CSV (the route lowercases on insert, as before). */
  email: string;
  sender: Sender;
}

/**
 * Ids and senders for the emails to import, decided once. useRpc is false when
 * the flow is off or the import is too large for one transaction: every item
 * is then 'legacy' and the route behaves exactly as before.
 */
export function planImport(
  emails: string[],
  cfg: { mode: FlowMode; canary: number },
  newId: () => string,
): { useRpc: boolean; items: ImportItem[] } {
  const useRpc = cfg.mode !== 'off' && emails.length >= 1 && emails.length <= IMPORT_RPC_MAX;
  const items = emails.map((email) => {
    const id = newId();
    return { id, email, sender: useRpc ? decideSender(cfg.mode, cfg.canary, id) : ('legacy' as Sender) };
  });
  return { useRpc, items };
}

/** What the route's inline activation answered for one email (legacy rows only). */
export interface InlineAnswer {
  isActivated: boolean;
  /** The route will email this licence (it did not answer 'activated'). */
  expectsEmail: boolean;
  planTier: string | null;
  billingCycle: string | null;
  moilUserId: string | null;
  expiresAt: string | null;
}

export interface ImportRpcRow {
  id: string;
  email: string;
  sender: Sender;
  needs_activation: boolean;
  expects_email: boolean;
  is_activated: boolean;
  plan_tier: string | null;
  billing_cycle: string | null;
  months: number | null;
  moil_user_id: string | null;
  expires_at: string | null;
}

/**
 * The RPC rows. A 'legacy' row carries what the route's inline activation
 * already answered (exactly the columns the inline insert wrote); an 'outbox'
 * row carries only the plan the caller sent, and the drain fills the rest.
 */
export function importRpcRows(
  items: ImportItem[],
  plan: { plan: string; billingCycle: string; months?: number } | null,
  inline: (email: string) => InlineAnswer,
): ImportRpcRow[] {
  return items.map((item) => {
    const base = {
      id: item.id,
      email: item.email.toLowerCase(),
      sender: item.sender,
      needs_activation: plan !== null,
      months: plan?.months ?? null,
    };
    if (item.sender === 'outbox') {
      return {
        ...base,
        expects_email: true,
        is_activated: false,
        plan_tier: plan?.plan ?? null,
        billing_cycle: plan?.billingCycle ?? null,
        moil_user_id: null,
        expires_at: null,
      };
    }
    const a = inline(item.email);
    return {
      ...base,
      expects_email: a.expectsEmail,
      is_activated: a.isActivated,
      plan_tier: a.planTier,
      billing_cycle: a.billingCycle,
      moil_user_id: a.moilUserId,
      expires_at: a.expiresAt,
    };
  });
}

export function issueImportLicensesViaOutbox(
  admin: SupabaseClient,
  args: { adminId: string; teamId: string | null; partnerId: string | null; rows: ImportRpcRow[] },
): Promise<IssueResult> {
  return callIssueRpc(admin, 'issue_import_licenses', args, 'database/add_license_import_outbox.sql');
}
