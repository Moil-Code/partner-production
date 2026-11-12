'use client';

import React, { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast/use-toast';
import {
  LICENSE_PLANS,
  MAX_MONTHS,
  PLAN_DISPLAY_NAMES,
  type LicensePlan,
} from '@/lib/licensePlanDefaults';

interface GrantAddonModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-filled and locked when opened from a specific licensee's row. */
  email?: string;
  /**
   * Pre-filled and locked together with `email` to EXTEND an add-on that is
   * already in force. The Moil backend extends a live grant of the same tier
   * instead of issuing a second one, so extending is a re-grant of that tier.
   */
  planTier?: LicensePlan;
  /** The current end date, shown so the operator knows what they are moving. */
  currentExpiresAt?: string | null;
  onGranted?: () => void | Promise<void>;
}

/**
 * Grant a time-boxed plan add-on — a higher tier for N months on top of the
 * licensee's existing license, which keeps running underneath.
 *
 * This is NOT the same action as "Add License". A license replaces what
 * someone is on; an add-on sits on top and expires by itself, and the copy
 * here has to make that difference obvious, because the two are one click
 * apart and only one of them is reversible by waiting.
 *
 * Moil admins only — the API enforces it; this component is simply not
 * mounted on the partner-admin dashboard.
 */
export function GrantAddonModal({
  isOpen,
  onClose,
  email: lockedEmail,
  planTier: lockedPlanTier,
  currentExpiresAt,
  onGranted,
}: GrantAddonModalProps) {
  const isExtend = !!lockedEmail && !!lockedPlanTier;
  const { toast } = useToast();
  const [email, setEmail] = useState(lockedEmail || '');
  const [planTier, setPlanTier] = useState<LicensePlan>(lockedPlanTier || 'market_pro');
  const [months, setMonths] = useState('1');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notEligible, setNotEligible] = useState<string | null>(null);

  // Re-seed when the modal is opened against a different licensee. Without
  // this the second row you click still shows the first row's email.
  React.useEffect(() => {
    if (isOpen) {
      setEmail(lockedEmail || '');
      setPlanTier(lockedPlanTier || 'market_pro');
      setMonths('1');
      setNote('');
      setNotEligible(null);
    }
  }, [isOpen, lockedEmail, lockedPlanTier]);

  if (!isOpen) return null;

  const monthsNum = Number.parseInt(months, 10);
  const monthsValid =
    Number.isInteger(monthsNum) && monthsNum >= 1 && monthsNum <= MAX_MONTHS;
  const canSubmit = email.trim().includes('@') && monthsValid && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setNotEligible(null);
    setSubmitting(true);
    try {
      const response = await fetch('/api/licenses/grant-addon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          planTier,
          months: monthsNum,
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Not a failure of the system — the person simply has no active plan
        // for an add-on to sit on. Kept on screen (a toast vanishes) so the operator
        // reads which button to use instead.
        if (data.code === 'NOT_ELIGIBLE') {
          setNotEligible(data.error || 'This person cannot receive an add-on.');
          return;
        }
        throw new Error(data.error || (isExtend ? 'Failed to extend add-on' : 'Failed to grant add-on'));
      }

      toast({
        // A grant whose CREDIT overlay has not landed is not a plain success:
        // the founder's feature gates are open and their AI allowance is
        // unchanged, so every action behind those gates is refused. It is not
        // an error either — the grant is real and the daily sweep retries it —
        // so it is shown as a warning that says what to expect.
        title:
          data.creditSync === 'failed'
            ? `Add-on ${data.extended ? 'extended' : 'granted'} — credits still pending`
            : `Add-on ${data.extended ? 'extended' : 'granted'}`,
        description:
          // `mirrored: false` means the grant IS live on Moil but this
          // dashboard has not recorded it. Saying so beats a clean success
          // message next to a table that does not show the row.
          data.mirrored === false
            ? `${data.message} (This dashboard may take a moment to show it.)`
            : data.message,
        type: data.creditSync === 'failed' ? 'warning' : 'success',
      });

      onClose();
      await onGranted?.();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'An error occurred',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--surface)] rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-violet-100 rounded-lg text-violet-700">
              <Sparkles className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">
              {isExtend ? 'Extend add-on' : 'Grant plan add-on'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-[var(--surface-subtle)] text-[var(--text-tertiary)]"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isExtend ? (
          <p className="text-sm text-[var(--text-secondary)] mb-5">
            Adds more time to {lockedEmail}&apos;s{' '}
            <strong className="font-medium text-[var(--text-primary)]">
              {PLAN_DISPLAY_NAMES[lockedPlanTier!]}
            </strong>{' '}
            add-on
            {currentExpiresAt
              ? `, which currently ends ${new Date(currentExpiresAt).toLocaleDateString()}`
              : ''}
            . The existing grant is extended — no second add-on is created — and
            their own license keeps running underneath. The new end date is
            shown once Moil confirms it.
          </p>
        ) : (
        <p className="text-sm text-[var(--text-secondary)] mb-5">
          Gives this person a higher tier for a set number of months.{' '}
          <strong className="font-medium text-[var(--text-primary)]">
            Their current license keeps running underneath
          </strong>{' '}
          and they go back to it when the add-on ends. They must already have a
          Moil account with an{' '}
          <strong className="font-medium text-[var(--text-primary)]">
            active license or subscription
          </strong>{' '}
          — one from a partner, a paid plan, or one Moil gave them. It takes
          effect straight away, even if they are logged in. For anyone without
          an active plan, use <em>Add License</em> instead. No seat is used,
          and the partner does not see this.
        </p>
        )}

        {notEligible && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          >
            {notEligible}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
              Email *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              readOnly={!!lockedEmail}
              className="w-full px-4 py-2.5 border border-[var(--border)] rounded-xl bg-[var(--surface)] text-[var(--text-primary)] focus:border-[var(--primary)] focus:outline-none read-only:bg-[var(--surface-subtle)] read-only:cursor-not-allowed"
              placeholder="founder@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
              Plan *
            </label>
            <select
              value={planTier}
              onChange={(e) => setPlanTier(e.target.value as LicensePlan)}
              disabled={isExtend}
              className="w-full disabled:bg-[var(--surface-subtle)] disabled:cursor-not-allowed px-4 py-2.5 border border-[var(--border)] rounded-xl bg-[var(--surface)] text-[var(--text-primary)] focus:border-[var(--primary)] focus:outline-none"
            >
              {LICENSE_PLANS.map((p) => (
                <option key={p} value={p}>
                  {PLAN_DISPLAY_NAMES[p]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
              {isExtend ? 'Add how many months?' : 'For how many months?'} (1–{MAX_MONTHS}) *
            </label>
            <input
              type="number"
              min={1}
              max={MAX_MONTHS}
              value={months}
              onChange={(e) => setMonths(e.target.value)}
              className="w-full px-4 py-2.5 border border-[var(--border)] rounded-xl bg-[var(--surface)] text-[var(--text-primary)] focus:border-[var(--primary)] focus:outline-none"
              required
            />
            {!monthsValid && months !== '' && (
              <p className="mt-1 text-sm text-red-600">
                Enter a whole number between 1 and {MAX_MONTHS}.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
              Note (optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              className="w-full px-4 py-2.5 border border-[var(--border)] rounded-xl bg-[var(--surface)] text-[var(--text-primary)] focus:border-[var(--primary)] focus:outline-none"
              placeholder={isExtend ? 'Why this was extended' : 'Why this was granted'}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!canSubmit}
              loading={submitting}
              className="flex-1"
            >
              {submitting
                ? isExtend ? 'Extending...' : 'Granting...'
                : isExtend ? 'Extend add-on' : 'Grant add-on'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
