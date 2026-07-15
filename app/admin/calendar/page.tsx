'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast/use-toast';
import { ContentCalendar } from '@/components/Calendar/ContentCalendar';
import { ContentSidebar } from '@/components/Calendar/ContentSidebar';
import { ImportContentForm } from '@/components/Calendar/ImportContentForm';
import type { ContentItem } from '@/lib/types/content';

/** First and last day (YYYY-MM-DD) of the visible 6-week grid for a month. */
function monthRange(month: Date): { from: string; to: string } {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 41);

  const key = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;

  return { from: key(start), to: key(end) };
}

export default function ContentCalendarPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [month, setMonth] = useState(() => new Date());
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Sidebar state: an item (edit) or a date (create). Both null = closed.
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const fetchItems = useCallback(
    async (targetMonth: Date) => {
      setLoading(true);
      try {
        const { from, to } = monthRange(targetMonth);
        const response = await fetch(`/api/content/list?from=${from}&to=${to}`);
        if (!response.ok) {
          if (response.status === 401) {
            router.push('/login');
            return;
          }
          throw new Error('Failed to load content');
        }
        const data = await response.json();
        setItems(data.items ?? []);
      } catch {
        toast({ title: 'Error', description: 'Failed to load content', type: 'error' });
      } finally {
        setLoading(false);
      }
    },
    [router, toast]
  );

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/login');
        return;
      }
      fetchItems(month);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeMonth = (delta: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setMonth(next);
    fetchItems(next);
  };

  const closeSidebar = () => {
    setSelectedItem(null);
    setSelectedDate(null);
  };

  return (
    <div className="min-h-screen bg-[var(--background)] font-sans text-[var(--text-primary)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="layout-container flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/dashboard"
              className="p-2 rounded-lg hover:bg-[var(--surface-subtle)] text-[var(--text-secondary)] transition-colors"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">Content Calendar</h1>
          </div>
        </div>
      </header>

      <main className="layout-container pb-20 pt-8 space-y-8 animate-fade-in">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <ContentCalendar
              month={month}
              items={items}
              loading={loading}
              onPrevMonth={() => changeMonth(-1)}
              onNextMonth={() => changeMonth(1)}
              onSelectDate={(date) => {
                setSelectedItem(null);
                setSelectedDate(date);
              }}
              onSelectItem={(item) => {
                setSelectedDate(null);
                setSelectedItem(item);
              }}
            />
          </div>

          <div className="space-y-6">
            <ImportContentForm onImported={() => fetchItems(month)} />
          </div>
        </div>
      </main>

      <ContentSidebar
        item={selectedItem}
        date={selectedDate}
        onClose={closeSidebar}
        onSaved={() => fetchItems(month)}
      />
    </div>
  );
}
