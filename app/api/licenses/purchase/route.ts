import { NextResponse } from 'next/server';

/**
 * GET /api/licenses/purchase — the browser lands here (via /payment) after
 * Stripe Checkout.
 *
 * It NO LONGER CHANGES SEAT COUNTS. Its query string (licenseCount, payment,
 * paymentType) is typed by whoever opens the URL, so it proves nothing; seats
 * are now added by the main API's Stripe webhook through
 * POST /api/licenses/purchase/fulfill, once Stripe says the session is paid.
 * This route only sends the person back to the dashboard, which says the seats
 * are on their way (`?purchase=processing`).
 *
 * The former public POST handler (add seats to any team id, no auth) is gone;
 * nothing called it.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const payment = searchParams.get('payment');
  const paymentType = searchParams.get('paymentType');

  if (payment !== 'successful' || paymentType !== 'license_purchase') {
    return NextResponse.redirect(new URL('/admin/dashboard?error=payment_failed', request.url));
  }
  return NextResponse.redirect(new URL('/admin/dashboard?purchase=processing', request.url));
}
