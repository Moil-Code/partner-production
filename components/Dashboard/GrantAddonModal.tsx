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
  onGranted,
}: GrantAddonModalProps) {
  const { toast } = useToast();
  const [email, setEmail] = useState(lockedEmail || '');
  const [planTier, setPlanTier] = useState<LicensePlan>('market_pro');
  const [months, setMonths] = useState('1');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Re-seed when the modal is opened against a different licensee. Without
  // this the second row you click still shows the first row's email.
  React.useEffect(() => {
    if (isOpen) {
      setEmail(lockedEmail || '');
      setPlanTier('market_pro');
      setMonths('1');
      setNote('');
    }
  }, [isOpen, lockedEmail]);

  if (!isOpen) return null;

  const monthsNum = Number.parseInt(months, 10);
  const monthsValid =
    Number.isInteger(monthsNum) && monthsNum >= 1 && monthsNum <= MAX_MONTHS;
  const canSubmit = email.trim().includes('@') && monthsValid && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

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
        throw new Error(data.error || 'Failed to grant add-on');
      }

      toast({
        title: data.pending ? 'Add-on stored' : 'Add-on granted',
        description:
          // `mirrored: false` means the grant IS live on Moil but this
          // dashboard has not recorded it. Saying so beats a clean success
          // message next to a table that does not show the row.
          data.mirrored === false
            ? `${data.message} (This dashboard may take a moment to show it.)`
            : data.message,
        type: 'success',
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
              Grant plan add-on
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

        <p className="text-sm text-[var(--text-secondary)] mb-5">
          Gives this person a higher tier for a set number of months.{' '}
          <strong className="font-medium text-[var(--text-primary)]">
            Their current license keeps running underneath
          </strong>{' '}
          and they go back to it when the add-on ends. No seat is used.
        </p>

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
              className="w-full px-4 py-2.5 border border-[var(--border)] rounded-xl bg-[var(--surface)] text-[var(--text-primary)] focus:border-[var(--primary)] focus:outline-none"
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
              For how many months? (1–{MAX_MONTHS}) *
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
              placeholder="Why this was granted"
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
              {submitting ? 'Granting...' : 'Grant add-on'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
