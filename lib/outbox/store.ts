/**
 * The outbox store over the service-role Supabase client: claim, settle,
 * health, prune (database/add_outbox.sql). Inert when the migration is not
 * applied: claim answers null (logged once per process), never throws.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { HealthRow, OutboxRow, OutboxStore } from './drain.ts';
import { MAX_ATTEMPTS, isMissingObject, type Outcome } from './rules.ts';

let warnedMissing = false;

function warnMissingOnce(where: string, error: unknown) {
  if (warnedMissing) return;
  warnedMissing = true;
  const code = (error as { code?: string } | null)?.code;
  console.warn(
    `[outbox] ${where}: outbox functions not installed (code ${code}); ` +
      'apply database/add_outbox.sql. Draining is skipped until then.',
  );
}

export function supabaseOutboxStore(admin: SupabaseClient): OutboxStore & {
  prune(): Promise<number | null>;
} {
  return {
    async claim(relayId, batch, leaseSeconds) {
      const { data, error } = await admin.rpc('outbox_claim', {
        p_relay: relayId,
        p_batch: batch,
        p_lease_seconds: leaseSeconds,
      });
      if (error) {
        if (isMissingObject(error)) {
          warnMissingOnce('claim', error);
          return null;
        }
        throw new Error(`outbox_claim failed (${error.code ?? 'unknown'})`);
      }
      return (data ?? []) as OutboxRow[];
    },

    async settle(id: string, relayId: string, outcome: Outcome, err?: string) {
      const { data, error } = await admin.rpc('outbox_settle', {
        p_id: id,
        p_relay: relayId,
        p_outcome: outcome,
        p_error: err ?? null,
        p_max_attempts: MAX_ATTEMPTS,
      });
      if (error) {
        console.error(`[outbox] settle failed for ${id} (${error.code ?? 'unknown'})`);
        return null;
      }
      return typeof data === 'string' ? data : null;
    },

    async health() {
      const { data, error } = await admin.rpc('outbox_health');
      if (error) {
        if (!isMissingObject(error)) {
          console.error(`[outbox] health failed (${error.code ?? 'unknown'})`);
        }
        return null;
      }
      return ((data ?? []) as HealthRow[]).map((r) => ({
        event_type: r.event_type,
        pending: Number(r.pending) || 0,
        oldest_pending_seconds: Number(r.oldest_pending_seconds) || 0,
        dead: Number(r.dead) || 0,
        delivered_last_hour: Number(r.delivered_last_hour) || 0,
      }));
    },

    async prune() {
      const { data, error } = await admin.rpc('outbox_prune', { p_batch: 5000 });
      if (error) {
        if (!isMissingObject(error)) console.error(`[outbox] prune failed (${error.code ?? 'unknown'})`);
        return null;
      }
      return typeof data === 'number' ? data : Number(data) || 0;
    },
  };
}
