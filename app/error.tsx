'use client';

import { useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      {/* Background Elements */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full bg-red-500/5 blur-[100px]" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <Card variant="glass" className="shadow-2xl border-t-4 border-t-red-500">
          <CardContent className="p-10 text-center">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-100">
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </div>
            
            <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Something went wrong!</h1>
            
            <p className="text-[var(--text-secondary)] mb-8 leading-relaxed">
              We encountered an unexpected error. Our team has been notified. Please try again or return home.
            </p>
            
            <div className="flex flex-col gap-3">
              <Button size="lg" onClick={() => reset()} className="w-full">
                <RefreshCw className="w-4 h-4 mr-2" />
                Try again
              </Button>
              
              <Button variant="outline" size="lg" onClick={() => window.location.href = '/'} className="w-full">
                <Home className="w-4 h-4 mr-2" />
                Return Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
