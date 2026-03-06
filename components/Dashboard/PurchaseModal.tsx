import React, { useState } from 'react';
import { X, CreditCard, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';

interface PurchaseModalProps {
  onClose: () => void;
  onPurchase: (count: number) => Promise<void>;
  purchasing: boolean;
  error?: string;
}

const LICENSE_PRESETS = [1, 5, 10, 15, 20];

export function PurchaseModal({ onClose, onPurchase, purchasing, error }: PurchaseModalProps) {
  const [licenseCount, setLicenseCount] = useState(5);
  const [customLicenseCount, setCustomLicenseCount] = useState('');
  const [useCustomCount, setUseCustomCount] = useState(false);

  const getPricePerLicense = (count: number) => {
    // Logic for volume discount - $12/month for >1 license, else $15/month
    return count > 1 ? 12 : 15;
  };

  const currentCount = useCustomCount ? (parseInt(customLicenseCount, 10) || 0) : licenseCount;
  const pricePerLicense = getPricePerLicense(currentCount);
  const totalPrice = currentCount * pricePerLicense * 12; // Annual price

  const handlePurchase = () => {
    if (currentCount > 0) {
      onPurchase(currentCount);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
      <Card variant="glass" className="w-full max-w-xl shadow-2xl border-[var(--glass-border)] bg-[var(--surface)]">
        <CardHeader className="flex flex-row items-center justify-between border-b border-[var(--border)] pb-4">
          <CardTitle className="text-xl flex items-center gap-2">
            <div className="p-2 bg-[var(--primary)]/10 rounded-lg">
              <CreditCard className="w-5 h-5 text-[var(--primary)]" />
            </div>
            Purchase Licenses
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-[var(--surface-subtle)]">
            <X className="w-5 h-5" />
          </Button>
        </CardHeader>

        <CardContent className="pt-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-3">
              How many licenses would you like to purchase?
            </label>
            
            {/* Preset Options */}
            <div className="grid grid-cols-5 gap-2 mb-4">
              {LICENSE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => {
                    setLicenseCount(preset);
                    setUseCustomCount(false);
                    setCustomLicenseCount('');
                  }}
                  className={`py-3 rounded-xl font-semibold text-sm transition-all duration-200 border ${
                    !useCustomCount && licenseCount === preset
                      ? 'bg-[var(--primary)] text-white border-[var(--primary)] shadow-md scale-105'
                      : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)] border-transparent hover:border-[var(--border)] hover:bg-[var(--surface)]'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Custom Input */}
            <div className="relative">
              <input 
                type="number" 
                min="1"
                value={customLicenseCount}
                onChange={(e) => {
                  setCustomLicenseCount(e.target.value);
                  setUseCustomCount(true);
                }}
                onFocus={() => setUseCustomCount(true)}
                className={`w-full px-4 py-3 border rounded-xl text-[var(--text-primary)] bg-[var(--surface)] focus:outline-none focus:ring-4 focus:ring-[var(--primary)]/10 transition-all duration-300 ${
                  useCustomCount ? 'border-[var(--primary)] ring-4 ring-[var(--primary)]/5' : 'border-[var(--border)]'
                }`}
                placeholder="Or enter a custom number..."
              />
              {useCustomCount && customLicenseCount && (
                <button
                  onClick={() => {
                    setUseCustomCount(false);
                    setCustomLicenseCount('');
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="bg-[var(--surface-subtle)] rounded-xl p-5 border border-[var(--border)]">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[var(--text-secondary)] text-sm">Price per license</span>
              <span className="font-semibold text-[var(--text-primary)]">${pricePerLicense}/month</span>
            </div>
            <div className="flex justify-between items-center mb-4">
              <span className="text-[var(--text-secondary)] text-sm">Quantity</span>
              <span className="font-semibold text-[var(--text-primary)]">{currentCount}</span>
            </div>
            <div className="border-t border-[var(--border)] my-3"></div>
            <div className="flex justify-between items-center">
              <span className="text-lg font-bold text-[var(--text-primary)]">Total</span>
              <div className="text-right">
                <div className="text-2xl font-bold text-[var(--primary)]">
                  ${totalPrice}
                </div>
                <div className="text-xs text-[var(--text-tertiary)] font-medium">billed annually</div>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl animate-in slide-in-from-top-2">
              <p className="text-red-700 text-sm flex items-center gap-2">
                <span className="text-lg">⚠️</span> {error}
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button 
              variant="outline" 
              onClick={onClose}
              className="flex-1 h-12 text-base"
            >
              Cancel
            </Button>
            <Button 
              onClick={handlePurchase}
              disabled={purchasing || currentCount < 1}
              className="flex-1 h-12 text-base shadow-lg shadow-[var(--primary)]/20"
              loading={purchasing}
            >
              {purchasing ? 'Processing...' : 'Continue to Payment'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
