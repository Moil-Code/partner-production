import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveContentOwner } from '@/lib/content/resolveOwner';
import { parseContentType } from '@/lib/types/content';

/**
 * CSV import for content calendar items.
 *
 * Expected columns (header row required, order-independent):
 *   title, content_type, scheduled_date, caption, media_url, status
 *
 * `content_type` accepts labels/slugs/synonyms (see parseContentType) and is
 * the field this feature centers on — it drives the calendar badge and the
 * click-to-open sidebar.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const owner = await resolveContentOwner(supabase);

    if (!owner) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.split('\n').filter((line) => line.trim());

    if (lines.length < 2) {
      return NextResponse.json(
        { error: 'CSV must contain a header row and at least one data row' },
        { status: 400 }
      );
    }

    // Parse header so columns can appear in any order.
    const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const col = (name: string) => header.indexOf(name);

    const idxTitle = col('title');
    const idxType = col('content_type');
    const idxDate = col('scheduled_date');
    const idxCaption = col('caption');
    const idxMedia = col('media_url');
    const idxStatus = col('status');

    if (idxDate === -1) {
      return NextResponse.json(
        { error: 'CSV is missing a required "scheduled_date" column' },
        { status: 400 }
      );
    }

    const errors: string[] = [];
    const rows = lines.slice(1);

    const toInsert = rows
      .map((line, i) => {
        const fields = splitCsvLine(line);
        const rowNum = i + 2; // 1-based, +1 for header

        const rawDate = (fields[idxDate] ?? '').trim();
        const scheduledDate = normalizeDate(rawDate);
        if (!scheduledDate) {
          errors.push(`Row ${rowNum}: invalid or missing date "${rawDate}"`);
          return null;
        }

        // content_type: default to still_image when blank, reject unknown values.
        const rawType = idxType === -1 ? '' : (fields[idxType] ?? '').trim();
        let contentType = parseContentType(rawType);
        if (!contentType) {
          if (rawType) {
            errors.push(
              `Row ${rowNum}: unknown content type "${rawType}" (use video, still image, carousel, or animated flyer)`
            );
            return null;
          }
          contentType = 'still_image';
        }

        return {
          admin_id: owner.userId,
          team_id: owner.teamId,
          partner_id: owner.partnerId,
          title: (idxTitle === -1 ? '' : fields[idxTitle] ?? '').trim(),
          content_type: contentType,
          scheduled_date: scheduledDate,
          caption: (idxCaption === -1 ? '' : fields[idxCaption] ?? '').trim(),
          media_url: (idxMedia === -1 ? '' : fields[idxMedia] ?? '').trim() || null,
          status: (idxStatus === -1 ? '' : fields[idxStatus] ?? '').trim() || 'scheduled',
          performed_by: owner.userId,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (toInsert.length === 0) {
      return NextResponse.json(
        { error: 'No valid rows to import', errors },
        { status: 400 }
      );
    }

    const { data: inserted, error: insertError } = await supabase
      .from('content_items')
      .insert(toInsert)
      .select();

    if (insertError) {
      console.error('Content import insert error:', insertError);
      return NextResponse.json(
        { error: `Failed to import content: ${insertError.message}` },
        { status: 500 }
      );
    }

    const success = inserted?.length ?? 0;

    if (owner.teamId && success > 0) {
      await supabase.rpc('log_activity', {
        p_team_id: owner.teamId,
        p_admin_id: owner.userId,
        p_activity_type: 'content_imported',
        p_description: `Imported ${success} content item(s) from CSV`,
        p_metadata: { success_count: success, failed_count: errors.length },
      });
    }

    return NextResponse.json(
      {
        message: `Import complete: ${success} item(s) added${
          errors.length ? `, ${errors.length} skipped` : ''
        }`,
        results: { success, failed: errors.length, errors },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Content CSV import error:', error);
    return NextResponse.json({ error: 'Failed to import CSV' }, { status: 500 });
  }
}

/** Minimal CSV line splitter supporting double-quoted fields with commas. */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/** Normalize a date string to YYYY-MM-DD, or return null if unparseable. */
function normalizeDate(raw: string): string | null {
  if (!raw) return null;

  // Already ISO-ish (YYYY-MM-DD)
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // US-style MM/DD/YYYY or M/D/YY
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    const [, m, d, rawYear] = us;
    const y = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return null;
}
