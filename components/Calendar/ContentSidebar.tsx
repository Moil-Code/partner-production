import React, { useEffect, useState } from 'react';
import { X, Trash2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast/use-toast';
import {
  CONTENT_TYPES,
  CONTENT_TYPE_COLORS,
  CONTENT_TYPE_ICONS,
  CONTENT_TYPE_LABELS,
  type ContentItem,
  type ContentType,
} from '@/lib/types/content';

interface ContentSidebarProps {
  /** The item being edited, or null when the sidebar is closed. */
  item: ContentItem | null;
  /** The date whose box was clicked (used to prefill a new item). */
  date: string | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Slide-in sidebar shown when a calendar box (or a content item within it) is
 * clicked. Lets the user pick the content type and edit the item's fields.
 */
export function ContentSidebar({ item, date, onClose, onSaved }: ContentSidebarProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [contentType, setContentType] = useState<ContentType>('still_image');
  const [scheduledDate, setScheduledDate] = useState('');
  const [caption, setCaption] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [status, setStatus] = useState('scheduled');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isCreate = !item;

  useEffect(() => {
    if (item) {
      setTitle(item.title);
      setContentType(item.contentType);
      setScheduledDate(item.scheduledDate);
      setCaption(item.caption);
      setMediaUrl(item.mediaUrl ?? '');
      setStatus(item.status);
    } else {
      setTitle('');
      setContentType('still_image');
      setScheduledDate(date ?? '');
      setCaption('');
      setMediaUrl('');
      setStatus('scheduled');
    }
  }, [item, date]);

  const open = item !== null || date !== null;

  const handleSave = async () => {
    if (!scheduledDate) {
      toast({ title: 'Date required', description: 'Please pick a date.', type: 'warning' });
      return;
    }
    setSaving(true);
    try {
      const payload = { title, contentType, scheduledDate, caption, mediaUrl, status };
      const response = await fetch(
        isCreate ? '/api/content' : `/api/content/${item!.id}`,
        {
          method: isCreate ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save');

      toast({
        title: isCreate ? 'Content added' : 'Content updated',
        description: `${CONTENT_TYPE_LABELS[contentType]} saved.`,
        type: 'success',
      });
      onSaved();
      onClose();
    } catch (err) {
      toast({ title: 'Error', description: errMsg(err), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/content/${item.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete');
      }
      toast({ title: 'Deleted', description: 'Content item removed.', type: 'success' });
      onSaved();
      onClose();
    } catch (err) {
      toast({ title: 'Error', description: errMsg(err), type: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-[var(--surface)] border-l border-[var(--border)] shadow-2xl z-50 transition-transform duration-300 flex flex-col ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            {isCreate ? 'New Content' : 'Edit Content'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--surface-subtle)] text-[var(--text-secondary)] transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Content type picker — the core of this feature */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Content Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CONTENT_TYPES.map((type) => {
                const active = contentType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setContentType(type)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                      active
                        ? 'text-white shadow-sm'
                        : 'bg-[var(--surface)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--primary)]/40'
                    }`}
                    style={
                      active
                        ? {
                            backgroundColor: CONTENT_TYPE_COLORS[type],
                            borderColor: CONTENT_TYPE_COLORS[type],
                          }
                        : undefined
                    }
                  >
                    <span>{CONTENT_TYPE_ICONS[type]}</span>
                    <span>{CONTENT_TYPE_LABELS[type]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="Title">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Content title"
              className={inputClass}
            />
          </Field>

          <Field label="Scheduled Date">
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Caption">
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              placeholder="Caption / notes"
              className={`${inputClass} resize-y`}
            />
          </Field>

          <Field label="Media URL">
            <input
              type="url"
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              placeholder="https://…"
              className={inputClass}
            />
          </Field>

          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={inputClass}
            >
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="published">Published</option>
            </select>
          </Field>
        </div>

        <div className="p-5 border-t border-[var(--border)] flex items-center gap-3">
          {!isCreate && (
            <Button variant="danger" onClick={handleDelete} disabled={deleting || saving}>
              {deleting ? <Spinner size="sm" /> : <Trash2 className="w-4 h-4" />}
            </Button>
          )}
          <Button className="flex-1" onClick={handleSave} loading={saving} disabled={deleting}>
            {!saving && <Save className="w-4 h-4 mr-2" />}
            {isCreate ? 'Add Content' : 'Save Changes'}
          </Button>
        </div>
      </aside>
    </>
  );
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

const inputClass =
  'w-full px-3 py-2.5 border border-[var(--border)] rounded-xl text-[var(--text-primary)] placeholder-[var(--text-tertiary)] bg-[var(--surface)] focus:border-[var(--primary)] focus:outline-none focus:ring-4 focus:ring-[var(--primary)]/10 transition-all';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">{label}</label>
      {children}
    </div>
  );
}
