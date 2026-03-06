import React from 'react';
import { ShoppingCart, PlusCircle, CreditCard } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface PurchaseCardProps {
  purchasedCount: number;
  availableCount: number;
  onPurchaseClick: () => void;
}

export function PurchaseCard({ purchasedCount, availableCount, onPurchaseClick }: PurchaseCardProps) {
  return (
    <Card variant="glass" className="bg-gradient-to-r from-[var(--surface)] to-[var(--primary)]/5 border-dashed border-2 border-[var(--primary)]/20 hover:border-[var(--primary)]/40 transition-all duration-300">
      <CardContent className="p-6 md:p-8">
        <div className="flex items-center justify-between flex-wrap gap-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-[var(--primary)]/10 rounded-xl text-[var(--primary)]">
               <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1 flex items-center gap-2">
                Need More Licenses?
              </h3>
              <p className="text-[var(--text-secondary)] text-sm max-w-xl">
                Currently have <span className="font-semibold text-[var(--text-primary)]">{purchasedCount}</span> purchased licenses (<span className="font-semibold text-[var(--text-primary)]">{availableCount}</span> available). 
                Add more at <span className="font-semibold text-[var(--accent)]">$15/month</span> each.
              </p>
            </div>
          </div>
          <Button 
            onClick={onPurchaseClick}
            variant="secondary"
            size="lg"
            className="w-full md:w-auto shadow-lg shadow-[var(--secondary)]/20 hover:shadow-[var(--secondary)]/40 hover:-translate-y-0.5 transition-all"
          >
            <ShoppingCart className="w-4 h-4 mr-2" />
            Purchase Licenses
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
