'use client';

import React, { useState } from 'react';
import { Mail, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { useToast } from '@/components/ui/toast/use-toast';

export interface ManagedLicense {
  id: string;
  email: string;
  is_activated: boolean;
}

interface LicenseRowActionsProps {
  license: ManagedLicense;
  /** Called after a mutation lands, so the caller can refetch its list. */
  onChanged: () => void | Promise<void>;
  /** Hide the email editor when a view only needs resend + delete. */
  allowEmailEdit?: boolean;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Resend / edit-email / delete controls for a single license row.
 *
 * Activated licenses are backed by a live account, so all three actions are
 * limited to pending ones — the API enforces the same rule, this just avoids
 * offering a button that is going to be refused.
 */
export function LicenseRowActions({
  license,
  onChanged,
  allowEmailEdit = true,
}: LicenseRowActionsProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<'resend' | 'delete' | 'email' | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailDraft, setEmailDraft] = useState(license.email);

  const isPending = !license.is_activated;

  const handleResend = async () => {
    setBusy('resend');
    try {
      const response = await fetch('/api/licenses/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseId: license.id }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to resend activation email');
      }

      toast({
        title: 'Email Sent',
        description: `Activation email resent to ${license.email}`,
        type: 'success',
      });
      await onChanged();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to resend activation email',
        type: 'error',
      });
    } finally {
      setBusy(null);
    }
  };

  const openEmailModal = () => {
    setEmailDraft(license.email);
    setShowEmailModal(true);
  };

  const handleUpdateEmail = async () => {
    const normalized = emailDraft.trim().toLowerCase();

    if (!EMAIL_PATTERN.test(normalized)) {
      toast({
        title: 'Invalid Email',
        description: 'Please enter a valid email address',
        type: 'error',
      });
      return;
    }

    if (normalized === license.email.toLowerCase()) {
      setShowEmailModal(false);
      return;
    }

    setBusy('email');
    try {
      const response = await fetch('/api/licenses/update-email', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseId: license.id, newEmail: normalized }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update email');
      }

      toast({
        title: 'Email Updated',
        description: `License moved to ${normalized}. Resend the invitation so the new address gets the link.`,
        type: 'success',
      });
      setShowEmailModal(false);
      await onChanged();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update email',
        type: 'error',
      });
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    setBusy('delete');
    try {
      const response = await fetch('/api/licenses/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseId: license.id }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete license');
      }

      toast({
        title: 'License Deleted',
        description: `License for ${license.email} was deleted`,
        type: 'success',
      });
      setShowDeleteModal(false);
      await onChanged();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete license',
        type: 'error',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleResend}
          disabled={!isPending || busy !== null}
          className="h-8 px-2 text-[var(--primary)] hover:bg-[var(--primary)]/10 disabled:opacity-40"
          title={isPending ? 'Resend activation email' : 'License is already activated'}
        >
          {busy === 'resend' ? (
            <Spinner size="sm" variant="primary" />
          ) : (
            <Mail className="w-4 h-4" />
          )}
          <span className="sr-only">Resend activation email</span>
        </Button>

        {allowEmailEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={openEmailModal}
            disabled={!isPending || busy !== null}
            className="h-8 px-2 text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] disabled:opacity-40"
            title={isPending ? 'Change email address' : 'Cannot edit an activated license'}
          >
            <Pencil className="w-4 h-4" />
            <span className="sr-only">Change email address</span>
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDeleteModal(true)}
          disabled={!isPending || busy !== null}
          className="h-8 px-2 text-red-600 hover:bg-red-50 disabled:opacity-40"
          title={isPending ? 'Delete license' : 'Cannot delete an activated license'}
        >
          <Trash2 className="w-4 h-4" />
          <span className="sr-only">Delete license</span>
        </Button>
      </div>

      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        isLoading={busy === 'delete'}
        title="Delete License"
        description={`Delete the pending license for ${license.email}? This frees the seat and cannot be undone.`}
        confirmText="Delete"
        variant="danger"
      />

      {showEmailModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--surface)] rounded-2xl shadow-2xl max-w-md w-full border border-[var(--border)]">
            <div className="p-6 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                  <Pencil className="w-5 h-5 text-[var(--primary)]" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[var(--text-primary)]">Change Email</h2>
                  <p className="text-sm text-[var(--text-secondary)]">Currently {license.email}</p>
                </div>
              </div>
              <button
                onClick={() => setShowEmailModal(false)}
                disabled={busy === 'email'}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label
                  htmlFor={`license-email-${license.id}`}
                  className="block text-sm font-medium text-[var(--text-secondary)] mb-2"
                >
                  New email address
                </label>
                <input
                  id={`license-email-${license.id}`}
                  type="email"
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleUpdateEmail();
                  }}
                  disabled={busy === 'email'}
                  autoFocus
                  className="w-full px-4 py-2.5 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] text-[var(--text-primary)]"
                />
                <p className="text-xs text-[var(--text-tertiary)] mt-2">
                  The invitation already sent to the old address stays valid until this license is
                  activated — resend it afterwards so the new address gets the link.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEmailModal(false)}
                  disabled={busy === 'email'}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleUpdateEmail}
                  disabled={busy === 'email'}
                  loading={busy === 'email'}
                  className="flex-1"
                >
                  {busy === 'email' ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
