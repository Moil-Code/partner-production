'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileQuestion, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      {/* Background Elements */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-[var(--primary)]/5 blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full bg-[var(--secondary)]/5 blur-[100px]" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <Card variant="glass" className="shadow-2xl border-t-4 border-t-[var(--secondary)]">
          <CardContent className="p-10 text-center">
            <div className="w-20 h-20 bg-[var(--surface-subtle)] rounded-full flex items-center justify-center mx-auto mb-6 border border-[var(--border)]">
              <FileQuestion className="w-10 h-10 text-[var(--text-tertiary)]" />
            </div>
            
            <h1 className="text-4xl font-bold text-[var(--text-primary)] mb-2">404</h1>
            <h2 className="text-xl font-semibold text-[var(--text-secondary)] mb-4">Page Not Found</h2>
            
            <p className="text-[var(--text-secondary)] mb-8 leading-relaxed">
              The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
            </p>
            
            <Link href="/">
              <Button size="lg" className="w-full">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Return Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
