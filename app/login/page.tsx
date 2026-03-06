'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast/use-toast';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Logo from '@/components/ui/Logo';
import { Mail, Lock, Eye, EyeOff, ArrowRight, ArrowLeft } from 'lucide-react';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  // Get redirect URL from query params (for invite acceptance flow)
  const redirectUrl = searchParams.get('redirect');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);

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

      // Sign in the admin user directly with Supabase
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        toast({
          title: "Login Failed",
          description: signInError.message,
          type: "error"
        });
        setLoading(false);
        return;
      }

      if (!data.user) {
        toast({
          title: "Login Failed",
          description: "Could not authenticate user",
          type: "error"
        });
        setLoading(false);
        return;
      }

      // Check the user's admin record in the database for proper role verification
      const { data: adminData, error: adminError } = await supabase
        .from('admins')
        .select('id, global_role, partner_id, partners(id, name, status)')
        .eq('id', data.user.id)
        .single();

      if (adminError || !adminData) {
        // User exists in auth but not in admins table - might be pending approval
        await supabase.auth.signOut();
        toast({
          title: "Access Pending",
          description: "Your account is pending approval. Please wait for admin confirmation.",
          type: "error"
        });
        setLoading(false);
        return;
      }

      // Check if user has a valid role
      const validRoles = ['moil_admin', 'partner_admin', 'member'];
      if (!validRoles.includes(adminData.global_role)) {
        await supabase.auth.signOut();
        toast({
          title: "Access Denied",
          description: "Your account does not have access to this portal.",
          type: "error"
        });
        setLoading(false);
        return;
      }

      // For partner_admin, verify they have an active partner (moil_admin doesn't need partner_id)
      if (adminData.global_role === 'partner_admin') {
        if (!adminData.partner_id) {
          await supabase.auth.signOut();
          toast({
            title: "Access Pending",
            description: "Your partner organization is pending approval. Please wait for admin confirmation.",
            type: "warning"
          });
          setLoading(false);
          return;
        }

        // Check if partner status is pending
        const partner = (adminData as any).partners;
        if (partner && partner.status === 'pending') {
          await supabase.auth.signOut();
          toast({
            title: "Access Pending",
            description: `Your organization "${partner.name}" is pending approval by Moil administrators. You'll receive an email once approved.`,
            type: "warning"
          });
          setLoading(false);
          return;
        }

        // Check if partner is suspended
        if (partner && partner.status === 'suspended') {
          await supabase.auth.signOut();
          toast({
            title: "Access Suspended",
            description: `Your organization "${partner.name}" has been suspended. Please contact support for assistance.`,
            type: "error"
          });
          setLoading(false);
          return;
        }
      }
      
      // moil_admin accounts don't need a partner_id - they manage all partners

      toast({
        title: "Welcome back!",
        description: adminData.global_role === 'moil_admin' 
          ? "Successfully logged in to Moil Admin Dashboard."
          : "Successfully logged in to Partner Dashboard.",
        type: "success"
      });

      // Redirect based on role
      if (redirectUrl) {
        router.push(redirectUrl);
      } else if (adminData.global_role === 'moil_admin') {
        router.push('/moil-admin/dashboard');
      } else {
        // For partner admins, check if they need to set up branding for the first time
        if (adminData.partner_id) {
          const { data: partnerData } = await supabase
            .from('partners')
            .select('primary_color, logo_url, secondary_color')
            .eq('id', adminData.partner_id)
            .single();

          // Only redirect to branding setup if branding has NEVER been set
          // (all fields are null or empty, not just using defaults)
          const brandingNeverSet = partnerData && 
            !partnerData.primary_color && 
            !partnerData.secondary_color && 
            !partnerData.logo_url;
          
          if (brandingNeverSet) {
            router.push('/admin/setup-branding');
            return;
          }
        }
        router.push('/admin/dashboard');
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        type: "error"
      });
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
            <Link href="/" className="inline-block group">
                <div className="flex items-center justify-center mb-4">
                    <Logo size="lg" />
                </div>
            </Link>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Admin Portal</h1>
            <p className="text-[var(--text-secondary)] text-sm mt-1">Secure access for platform administrators</p>
          </div>

          {/* Login Card */}
          <Card variant="glass" className="border-t-4 border-t-[var(--primary)] shadow-2xl">
            <CardContent className="p-8">
              <form onSubmit={handleSubmit} className="space-y-5">
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

                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Password</label>
                  <div className="relative group">
                    <input 
                      type={showPassword ? "text" : "password"} 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 pl-11 pr-12 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
                      placeholder="••••••••"
                      required
                      disabled={loading}
                    />
                    <Lock className="w-5 h-5 text-[var(--text-tertiary)] absolute left-3.5 top-3.5 group-focus-within:text-[var(--primary)] transition-colors" />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-3.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                      disabled={loading}
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input 
                      type="checkbox" 
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]/20" 
                      disabled={loading}
                    />
                    <span className="text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">Remember me</span>
                  </label>
                  <Link href="/forgot-password" className="text-[var(--text-secondary)] hover:text-[var(--primary)]/80 font-medium transition-colors hover:underline">Forgot password?</Link>
                </div>

                <Button 
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 text-base shadow-lg shadow-[var(--primary)]/20"
                  loading={loading}
                >
                  {loading ? 'Signing In...' : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-8 pt-6 border-t border-[var(--border)] text-center">
                <p className="text-sm text-[var(--text-primary)]">
                  Don't have an admin account? <Link href="/signup" className="text-[var(--primary)] font-semibold hover:underline">Request Access</Link>
                </p>
              </div>
            </CardContent>
          </Card>
          
          <div className="mt-8 text-center">
            <Link href="/" className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-sm transition-colors flex items-center justify-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                Return to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" variant="primary" className="mx-auto" />
          <p className="mt-4 text-[var(--text-secondary)]">Loading...</p>
        </div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
