import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveContentOwner } from '@/lib/content/resolveOwner';
import type { ContentItem, ContentType } from '@/lib/types/content';

/**
 * List content items for the calendar. RLS scopes rows to the caller, so we
 * don't filter by owner here. Optional `from`/`to` (YYYY-MM-DD) narrow to a
 * visible month range.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const owner = await resolveContentOwner(supabase);

    if (!owner) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    let query = supabase
      .from('content_items')
      .select('*')
      .order('scheduled_date', { ascending: true });

    if (from) query = query.gte('scheduled_date', from);
    if (to) query = query.lte('scheduled_date', to);

    const { data, error } = await query;

    if (error) {
      console.error('Content list error:', error);
      return NextResponse.json({ error: 'Failed to load content' }, { status: 500 });
    }

    const items: ContentItem[] = (data ?? []).map((row) => ({
      id: row.id,
      title: row.title ?? '',
      contentType: row.content_type as ContentType,
      scheduledDate: row.scheduled_date,
      caption: row.caption ?? '',
      status: row.status ?? 'scheduled',
      mediaUrl: row.media_url ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Content list error:', error);
    return NextResponse.json({ error: 'Failed to load content' }, { status: 500 });
  }
}
