'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast/use-toast';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Logo from '@/components/ui/Logo';
import { Lock, Eye, EyeOff, CheckCircle, ArrowRight, ArrowLeft } from 'lucide-react';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if we have the necessary tokens from the URL
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    const type = hashParams.get('type');

    if (type === 'recovery' && accessToken) {
      // Set the session with the recovery tokens
      const supabase = createClient();
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken || '',
      });
    }
  }, []);

  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 8) {
      return 'Password must be at least 8 characters long';
    }
    if (!/[A-Z]/.test(pwd)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/[a-z]/.test(pwd)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/[0-9]/.test(pwd)) {
      return 'Password must contain at least one number';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password strength
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        setError(updateError.message);
        toast({
          title: "Error",
          description: updateError.message,
          type: "error"
        });
        setLoading(false);
        return;
      }

      setSuccess(true);
      toast({
        title: "Password Updated",
        description: "Your password has been successfully reset",
        type: "success"
      });

      // Redirect to login after 3 seconds
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
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
            <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Create New Password</h1>
            <p className="text-[var(--text-secondary)] text-sm mt-1">Secure your account with a new password</p>
          </div>

          {/* Card */}
          <Card variant="glass" className="border-t-4 border-t-[var(--primary)] shadow-2xl">
            <CardContent className="p-8">
              {success ? (
                <div className="text-center py-4">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 ring-4 ring-green-50">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                  <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Password Reset Successful!</h2>
                  <p className="text-[var(--text-secondary)] mb-6 leading-relaxed">
                    Your password has been updated. You will be redirected to the login page shortly.
                  </p>
                  <Button
                    onClick={() => router.push('/login')}
                    className="w-full"
                  >
                    Go to Login
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              ) : (
                <>
                  {error && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-2">
                      <div className="mt-0.5">⚠️</div>
                      <p>{error}</p>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">New Password</label>
                      <div className="relative group">
                        <input 
                          type={showPassword ? "text" : "password"} 
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full px-4 py-3 pl-11 pr-12 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
                          placeholder="••••••••"
                          required
                          disabled={loading}
                          minLength={8}
                        />
                        <Lock className="w-5 h-5 text-[var(--text-tertiary)] absolute left-3.5 top-3.5 group-focus-within:text-[var(--primary)] transition-colors" />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-3.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                          disabled={loading}
                        >
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Confirm New Password</label>
                      <div className="relative group">
                        <input 
                          type={showConfirmPassword ? "text" : "password"} 
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full px-4 py-3 pl-11 pr-12 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
                          placeholder="••••••••"
                          required
                          disabled={loading}
                          minLength={8}
                        />
                        <Lock className="w-5 h-5 text-[var(--text-tertiary)] absolute left-3.5 top-3.5 group-focus-within:text-[var(--primary)] transition-colors" />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3.5 top-3.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                          disabled={loading}
                        >
                          {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>

                    {/* Password requirements */}
                    <div className="bg-[var(--surface-subtle)] p-4 rounded-xl border border-[var(--border)]">
                      <p className="font-medium text-[var(--text-secondary)] text-xs mb-2">Password requirements:</p>
                      <ul className="space-y-1.5">
                        <li className={`text-xs flex items-center gap-2 ${password.length >= 8 ? 'text-green-600' : 'text-[var(--text-tertiary)]'}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${password.length >= 8 ? 'bg-green-500' : 'bg-[var(--text-tertiary)]'}`} />
                          At least 8 characters
                        </li>
                        <li className={`text-xs flex items-center gap-2 ${/[A-Z]/.test(password) ? 'text-green-600' : 'text-[var(--text-tertiary)]'}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${/[A-Z]/.test(password) ? 'bg-green-500' : 'bg-[var(--text-tertiary)]'}`} />
                          One uppercase letter
                        </li>
                        <li className={`text-xs flex items-center gap-2 ${/[a-z]/.test(password) ? 'text-green-600' : 'text-[var(--text-tertiary)]'}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${/[a-z]/.test(password) ? 'bg-green-500' : 'bg-[var(--text-tertiary)]'}`} />
                          One lowercase letter
                        </li>
                        <li className={`text-xs flex items-center gap-2 ${/[0-9]/.test(password) ? 'text-green-600' : 'text-[var(--text-tertiary)]'}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${/[0-9]/.test(password) ? 'bg-green-500' : 'bg-[var(--text-tertiary)]'}`} />
                          One number
                        </li>
                      </ul>
                    </div>

                    <Button 
                      type="submit"
                      disabled={loading || !password || !confirmPassword}
                      className="w-full h-12 text-base shadow-lg shadow-[var(--primary)]/20"
                      loading={loading}
                    >
                      {loading ? (
                        'Updating...'
                      ) : (
                        <span>Reset Password</span>
                      )}
                    </Button>
                  </form>
                </>
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" variant="primary" className="mx-auto" />
          <p className="mt-4 text-[var(--text-secondary)]">Loading...</p>
        </div>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
