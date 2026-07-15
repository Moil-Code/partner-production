import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import {
  CONTENT_TYPE_COLORS,
  CONTENT_TYPE_ICONS,
  CONTENT_TYPE_LABELS,
  type ContentItem,
} from '@/lib/types/content';

interface ContentCalendarProps {
  /** First day of the visible month. */
  month: Date;
  items: ContentItem[];
  loading: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  /** Clicking a day box (empty area) opens the sidebar to add content. */
  onSelectDate: (date: string) => void;
  /** Clicking a content chip opens the sidebar to edit that item. */
  onSelectItem: (item: ContentItem) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Format a Date as a local YYYY-MM-DD string (no UTC shift). */
function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function ContentCalendar({
  month,
  items,
  loading,
  onPrevMonth,
  onNextMonth,
  onSelectDate,
  onSelectItem,
}: ContentCalendarProps) {
  // Group items by their scheduled date for O(1) lookup per cell.
  const itemsByDate = useMemo(() => {
    const map = new Map<string, ContentItem[]>();
    for (const item of items) {
      const list = map.get(item.scheduledDate) ?? [];
      list.push(item);
      map.set(item.scheduledDate, list);
    }
    return map;
  }, [items]);

  // Build the 6-week grid covering the visible month.
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay()); // back up to Sunday

    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [month]);

  const todayKey = toDateKey(new Date());
  const monthLabel = month.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{monthLabel}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onPrevMonth}
            className="p-2 rounded-lg hover:bg-[var(--surface-subtle)] text-[var(--text-secondary)] transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={onNextMonth}
            className="p-2 rounded-lg hover:bg-[var(--surface-subtle)] text-[var(--text-secondary)] transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface-subtle)]/40 text-xs">
        {(Object.keys(CONTENT_TYPE_LABELS) as (keyof typeof CONTENT_TYPE_LABELS)[]).map((type) => (
          <span key={type} className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: CONTENT_TYPE_COLORS[type] }}
            />
            {CONTENT_TYPE_ICONS[type]} {CONTENT_TYPE_LABELS[type]}
          </span>
        ))}
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-[var(--border)]">
        {WEEKDAYS.map((wd) => (
          <div
            key={wd}
            className="px-2 py-2 text-center text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide"
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 relative">
        {loading && (
          <div className="absolute inset-0 bg-[var(--surface)]/60 z-10 flex items-center justify-center text-sm text-[var(--text-secondary)]">
            Loading…
          </div>
        )}
        {cells.map((date, i) => {
          const key = toDateKey(date);
          const inMonth = date.getMonth() === month.getMonth();
          const isToday = key === todayKey;
          const dayItems = itemsByDate.get(key) ?? [];

          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelectDate(key)}
              className={`group text-left min-h-[104px] p-1.5 border-b border-r border-[var(--border)] transition-colors align-top ${
                inMonth
                  ? 'bg-[var(--surface)] hover:bg-[var(--primary)]/5'
                  : 'bg-[var(--surface-subtle)]/40 hover:bg-[var(--surface-subtle)]'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                    isToday
                      ? 'bg-[var(--primary)] text-white'
                      : inMonth
                        ? 'text-[var(--text-primary)]'
                        : 'text-[var(--text-tertiary)]'
                  }`}
                >
                  {date.getDate()}
                </span>
                <Plus className="w-3.5 h-3.5 text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              <div className="space-y-1">
                {dayItems.slice(0, 3).map((item) => (
                  <span
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectItem(item);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        e.preventDefault();
                        onSelectItem(item);
                      }
                    }}
                    className="flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] font-medium text-white truncate cursor-pointer hover:opacity-90"
                    style={{ backgroundColor: CONTENT_TYPE_COLORS[item.contentType] }}
                    title={`${CONTENT_TYPE_LABELS[item.contentType]}: ${item.title || 'Untitled'}`}
                  >
                    <span>{CONTENT_TYPE_ICONS[item.contentType]}</span>
                    <span className="truncate">{item.title || CONTENT_TYPE_LABELS[item.contentType]}</span>
                  </span>
                ))}
                {dayItems.length > 3 && (
                  <span className="block text-[11px] text-[var(--text-tertiary)] px-1.5">
                    +{dayItems.length - 3} more
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
