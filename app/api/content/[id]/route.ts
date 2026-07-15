import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveContentOwner } from '@/lib/content/resolveOwner';
import { CONTENT_TYPES, type ContentType } from '@/lib/types/content';

/**
 * Update a single content item — used by the calendar sidebar to change the
 * content type, title, caption, date, media URL, or status. RLS ensures the
 * caller can only touch their own rows.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const owner = await resolveContentOwner(supabase);

    if (!owner) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const update: Record<string, unknown> = {};

    if (typeof body.title === 'string') update.title = body.title;
    if (typeof body.caption === 'string') update.caption = body.caption;
    if (typeof body.status === 'string') update.status = body.status;
    if (typeof body.mediaUrl === 'string') update.media_url = body.mediaUrl || null;
    if (typeof body.scheduledDate === 'string' && body.scheduledDate) {
      update.scheduled_date = body.scheduledDate;
    }
    if (body.contentType !== undefined) {
      if (!CONTENT_TYPES.includes(body.contentType as ContentType)) {
        return NextResponse.json({ error: 'Invalid content type' }, { status: 400 });
      }
      update.content_type = body.contentType;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('content_items')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Content update error:', error);
      return NextResponse.json({ error: 'Failed to update content' }, { status: 500 });
    }

    return NextResponse.json({ item: data });
  } catch (error) {
    console.error('Content update error:', error);
    return NextResponse.json({ error: 'Failed to update content' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const owner = await resolveContentOwner(supabase);

    if (!owner) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabase.from('content_items').delete().eq('id', id);

    if (error) {
      console.error('Content delete error:', error);
      return NextResponse.json({ error: 'Failed to delete content' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Content delete error:', error);
    return NextResponse.json({ error: 'Failed to delete content' }, { status: 500 });
  }
}
