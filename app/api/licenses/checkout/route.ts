import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { moilApiUrl, moilPartnerApiKey } from '@/lib/moilApi';

/**
 * POST /api/licenses/checkout — start a Stripe Checkout for more seats.
 *
 * Body: { count: number }  (integer, 1..10000)
 *
 * WHY THIS IS A SERVER ROUTE. The dashboard used to call the main API's
 * buy-licenses endpoint directly from the browser with the partner API key
 * read from a NEXT_PUBLIC_* variable, which shipped the key to every visitor.
 * The key now stays on the server (lib/moilApi.ts).
 *
 * Who is buying, and for which team, is resolved HERE from the session (the
 * same way /api/licenses/add does), never from the body, and travels to the
 * main API as `partnerAdminId` / `partnerTeamId`. The main API writes them into
 * the Checkout session's metadata, and its Stripe webhook later calls
 * /api/licenses/purchase/fulfill with them. So seats are added only for a
 * payment Stripe confirmed, to the account that started it.
 *
 * Idempotency: each call creates a new Checkout session; nothing is charged or
 * credited until the person pays, and a session is fulfilled once
 * (license_purchases is keyed by the Stripe session id).
 */

const MAX_COUNT = 10000;
const TIMEOUT_MS = 15000;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const count = body?.count;
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
      return NextResponse.json(
        { success: false, message: `count must be a whole number from 1 to ${MAX_COUNT}` },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: 'Unauthorized. Please login.' }, { status: 401 });
    }

    const { data: adminData, error: adminError } = await supabase
      .from('admins')
      .select('id, email, partner:partners(id, name, program_name)')
      .eq('id', user.id)
      .single();
    if (adminError || !adminData) {
      return NextResponse.json(
        { success: false, message: 'Access denied. Admin account required.' },
        { status: 403 },
      );
    }

    const partner = adminData.partner as unknown as { name?: string; program_name?: string } | null;

    const { data: teamMember } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('admin_id', user.id)
      .maybeSingle();
    const teamId: string | null = teamMember?.team_id ?? null;

    const email = adminData.email || user.email;
    if (!email) {
      return NextResponse.json(
        { success: false, message: 'Your account has no email address.' },
        { status: 400 },
      );
    }

    const apiKey = moilPartnerApiKey();
    const apiUrl = moilApiUrl();
    if (!apiKey || !apiUrl) {
      console.error('[licenses/checkout] main API key or URL is not configured.');
      return NextResponse.json(
        { success: false, message: 'Purchasing is not configured on this server.' },
        { status: 503 },
      );
    }

    let resp: Response;
    try {
      resp = await fetch(`${apiUrl}/api/stripe/buy-licenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({
          // The "Moil Partner" prefix is how the main API picks this app's
          // return URL; keep it.
          name: `Moil Partner ${partner?.program_name || partner?.name || ''}`.trim(),
          email,
          numberOfLicenses: count,
          partnerAdminId: user.id,
          partnerTeamId: teamId,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      console.error('[licenses/checkout] main API unreachable:', err instanceof Error ? err.name : err);
      return NextResponse.json(
        { success: false, message: 'The payment service did not answer. Please try again.' },
        { status: 502 },
      );
    }

    const data = await resp.json().catch(() => null);
    if (!data || typeof data !== 'object') {
      return NextResponse.json(
        { success: false, message: 'The payment service sent an unreadable answer.' },
        { status: 502 },
      );
    }
    // Pass the main API's own answer through: { success, data: { url } } or
    // its error envelope. A 401 from it means OUR key is wrong, which is a
    // server problem, not the person's session.
    const status = resp.status === 401 || resp.status === 403 ? 502 : resp.status;
    return NextResponse.json(data, { status });
  } catch (error) {
    console.error('[licenses/checkout] unexpected error:', error);
    return NextResponse.json({ success: false, message: 'An unexpected error occurred' }, { status: 500 });
  }
}
