'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast/use-toast';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Logo from '@/components/ui/Logo';
import { Mail, ArrowLeft, CheckCircle, ArrowRight } from 'lucide-react';

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validate email format
    if (!email.includes('@')) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address",
        type: "error"
      });
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          type: "error"
        });
        setLoading(false);
        return;
      }

      setEmailSent(true);
      toast({
        title: "Email Sent",
        description: "Check your email for the password reset link",
        type: "success"
      });
    } catch (err) {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        type: "error"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center font-sans overflow-hidden bg-[var(--background)]">
      {/* Background Elements */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-[var(--primary)]/10 blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full bg-[var(--secondary)]/10 blur-[100px]" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="w-full max-w-md mx-auto">
          {/* Logo Section */}
          <div className="text-center mb-8 animate-fade-in">
            <Link href="/login" className="inline-block group">
              <div className="flex items-center justify-center mb-4">
                <Logo size="lg" />
              </div>
            </Link>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Reset Password</h1>
            <p className="text-[var(--text-secondary)] text-sm mt-1">Recover access to your admin account</p>
          </div>

          {/* Card */}
          <Card variant="glass" className="border-t-4 border-t-[var(--primary)] shadow-2xl">
            <CardContent className="p-8">
              {emailSent ? (
                <div className="text-center py-4">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 ring-4 ring-green-50">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                  <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Check Your Email</h2>
                  <p className="text-[var(--text-secondary)] mb-6 leading-relaxed">
                    We've sent a password reset link to <br/>
                    <strong className="text-[var(--text-primary)]">{email}</strong>
                  </p>
                  <div className="bg-[var(--surface-subtle)] rounded-lg p-4 mb-6 border border-[var(--border)]">
                    <p className="text-xs text-[var(--text-tertiary)]">
                      Didn't receive the email? Check your spam folder or try again.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setEmailSent(false)}
                    className="w-full"
                  >
                    Try a different email
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="text-center mb-2">
                    <p className="text-[var(--text-secondary)] text-sm">
                      Enter your email address and we'll send you a link to reset your password.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Email Address</label>
                    <div className="relative group">
                      <input 
                        type="email" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-4 py-3 pl-11 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
                        placeholder="admin@partner.com"
                        required
                        disabled={loading}
                      />
                      <Mail className="w-5 h-5 text-[var(--text-tertiary)] absolute left-3.5 top-3.5 group-focus-within:text-[var(--primary)] transition-colors" />
                    </div>
                  </div>

                  <Button 
                    type="submit"
                    disabled={loading || !email}
                    className="w-full h-12 text-base shadow-lg shadow-[var(--primary)]/20"
                    loading={loading}
                  >
                    {loading ? (
                      'Sending...'
                    ) : (
                      <>
                        <span>Send Reset Link</span>
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </form>
              )}

              <div className="mt-8 pt-6 border-t border-[var(--border)] text-center">
                <Link href="/login" className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-sm transition-colors flex items-center justify-center gap-2 group">
                  <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                  Back to Login
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
