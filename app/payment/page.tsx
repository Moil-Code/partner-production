'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent } from '@/components/ui/card';

const PaymentRedirectContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Get all query parameters
    const licenseCount = searchParams.get('licenseCount');
    const payment = searchParams.get('payment');
    const paymentType = searchParams.get('paymentType');

    // Redirect to API endpoint with same parameters
    const apiUrl = `/api/licenses/purchase?licenseCount=${licenseCount}&payment=${payment}&paymentType=${paymentType}`;
    
    console.log('Redirecting to API endpoint:', apiUrl);
    window.location.href = apiUrl;
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      <Card variant="glass" className="max-w-md w-full text-center shadow-xl border-[var(--primary)]/10">
        <CardContent className="pt-10 pb-10">
          <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center">
            <Spinner size="xl" variant="primary" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Processing Payment</h1>
          <p className="text-[var(--text-secondary)]">Please wait while we process your payment...</p>
        </CardContent>
      </Card>
    </div>
  );
};

const PaymentRedirectPage = () => {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <Card variant="glass" className="max-w-md w-full text-center shadow-xl">
          <CardContent className="pt-10 pb-10">
            <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center">
              <Spinner size="xl" variant="primary" />
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Loading Payment</h1>
            <p className="text-[var(--text-secondary)]">Please wait...</p>
          </CardContent>
        </Card>
      </div>
    }>
      <PaymentRedirectContent />
    </Suspense>
  );
};

export default PaymentRedirectPage;
