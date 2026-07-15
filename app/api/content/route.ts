import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveContentOwner } from '@/lib/content/resolveOwner';
import { CONTENT_TYPES, type ContentType } from '@/lib/types/content';

/**
 * Create a single content item — used by the calendar sidebar when adding
 * content to a day (as opposed to the bulk CSV import).
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const owner = await resolveContentOwner(supabase);

    if (!owner) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    if (!body.scheduledDate) {
      return NextResponse.json({ error: 'A scheduled date is required' }, { status: 400 });
    }

    const contentType = (body.contentType as ContentType) ?? 'still_image';
    if (!CONTENT_TYPES.includes(contentType)) {
      return NextResponse.json({ error: 'Invalid content type' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('content_items')
      .insert({
        admin_id: owner.userId,
        team_id: owner.teamId,
        partner_id: owner.partnerId,
        title: typeof body.title === 'string' ? body.title : '',
        content_type: contentType,
        scheduled_date: body.scheduledDate,
        caption: typeof body.caption === 'string' ? body.caption : '',
        media_url: body.mediaUrl || null,
        status: typeof body.status === 'string' ? body.status : 'scheduled',
        performed_by: owner.userId,
      })
      .select()
      .single();

    if (error) {
      console.error('Content create error:', error);
      return NextResponse.json({ error: 'Failed to create content' }, { status: 500 });
    }

    return NextResponse.json({ item: data }, { status: 201 });
  } catch (error) {
    console.error('Content create error:', error);
    return NextResponse.json({ error: 'Failed to create content' }, { status: 500 });
  }
}
