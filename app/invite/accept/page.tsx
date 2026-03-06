'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Logo from '@/components/ui/Logo';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { CheckCircle, AlertCircle, Clock, Shield, Users, Mail, ArrowRight, LogIn } from 'lucide-react';
import { useToast } from '@/components/ui/toast/use-toast';

interface InvitationDetails {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  team: {
    id: string;
    name: string;
    domain: string;
  };
  inviter: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

function AcceptInviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    if (token) {
      checkAuthAndFetchInvitation();
    } else {
      setError('No invitation token provided');
      setLoading(false);
    }
  }, [token]);

  const checkAuthAndFetchInvitation = async () => {
    try {
      // Check authentication
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        setIsAuthenticated(true);
        setUserEmail(user.email || '');
      }

      // Fetch invitation details
      const response = await fetch(`/api/team/invite/accept?token=${token}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to load invitation');
        setLoading(false);
        return;
      }

      setInvitation(data.invitation);
    } catch (err) {
      setError('Failed to load invitation details');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvitation = async () => {
    if (!isAuthenticated) {
      // Redirect to login with return URL
      router.push(`/login?redirect=/invite/accept?token=${token}`);
      return;
    }

    // Check if email matches before attempting to accept
    if (userEmail && invitation && userEmail !== invitation.email) {
      toast({
        title: "Email Mismatch",
        description: `This invitation is for ${invitation.email}. Please log in with the correct account.`,
        type: "error"
      });
      return;
    }

    setAccepting(true);
    setError('');

    try {
      const response = await fetch('/api/team/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage = data.error || 'Failed to accept invitation';
        setError(errorMessage);
        toast({
          title: "Invitation Error",
          description: errorMessage,
          type: "error"
        });
        setAccepting(false);
        return;
      }

      // Show success toast
      toast({
        title: "Welcome to the Team!",
        description: `You've successfully joined ${invitation?.team.name}. Redirecting to dashboard...`,
        type: "success"
      });

      // Redirect to dashboard
      setTimeout(() => {
        router.push('/admin/dashboard');
      }, 1000);
    } catch (err) {
      const errorMessage = 'An error occurred while accepting the invitation';
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        type: "error"
      });
      setAccepting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" variant="primary" className="mx-auto" />
          <p className="mt-4 text-[var(--text-secondary)]">Loading invitation...</p>
        </div>
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <Card variant="glass" className="max-w-md w-full text-center shadow-xl border-red-100">
          <CardContent className="pt-8 pb-8">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Invalid Invitation</h1>
            <p className="text-[var(--text-secondary)] mb-6">{error}</p>
            <Button
              onClick={() => router.push('/login')}
              className="w-full"
            >
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4 font-sans relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] left-[-5%] w-[600px] h-[600px] rounded-full bg-[var(--primary)]/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[600px] h-[600px] rounded-full bg-[var(--secondary)]/5 blur-[120px]" />
      </div>

      <div className="w-full max-w-lg relative z-10">
        <div className="text-center mb-8 animate-fade-in">
          <div className="flex justify-center mb-6">
            <Logo size="lg" />
          </div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight">Team Invitation</h1>
          <p className="text-[var(--text-secondary)] mt-2">You've been invited to join a team on Moil Partners</p>
        </div>

        {invitation && (
          <Card variant="glass" className="shadow-2xl border-t-4 border-t-[var(--primary)] overflow-hidden animate-fade-in">
            <CardHeader className="bg-[var(--surface-subtle)]/50 border-b border-[var(--border)] pb-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-[var(--primary)] to-[var(--primary-600)] rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg border-2 border-white">
                  {invitation.inviter?.first_name?.[0]}{invitation.inviter?.last_name?.[0]}
                </div>
                <div>
                  <p className="text-[var(--text-primary)] font-semibold text-lg">
                    {invitation.inviter?.first_name} {invitation.inviter?.last_name}
                  </p>
                  <p className="text-[var(--text-secondary)] text-sm">invited you to join</p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-6 space-y-6">
              {/* Team Info */}
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-sm">
                <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                  <Users className="w-5 h-5 text-[var(--primary)]" />
                  {invitation.team.name}
                </h2>
                <div className="flex items-center gap-2 text-[var(--text-secondary)] text-sm mb-4 bg-[var(--surface-subtle)] px-2 py-1 rounded-md inline-block border border-[var(--border)]">
                  <span className="opacity-70">Domain:</span> @{invitation.team.domain}
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-[var(--secondary)]/10 text-[var(--secondary)] border border-[var(--secondary)]/20 rounded-full text-sm font-semibold capitalize flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5" />
                    {invitation.role}
                  </span>
                  <span className="text-[var(--text-tertiary)] text-sm">role assigned</span>
                </div>
              </div>

              {/* Email Mismatch Warning */}
              {isAuthenticated && userEmail && invitation.email !== userEmail && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 items-start">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-amber-800 text-sm">
                    <strong>Warning:</strong> This invitation was sent to <strong>{invitation.email}</strong>, 
                    but you're logged in as <strong>{userEmail}</strong>. 
                    Please log in with the correct account to accept this invitation.
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col gap-3">
                <Button
                  onClick={handleAcceptInvitation}
                  disabled={accepting || (isAuthenticated && userEmail !== invitation.email)}
                  className="w-full h-12 text-base shadow-lg shadow-[var(--primary)]/20"
                  size="lg"
                >
                  {accepting ? (
                    <>
                      <Spinner size="sm" className="mr-2 text-white border-white" />
                      Accepting...
                    </>
                  ) : isAuthenticated ? (
                    <>
                      Accept Invitation
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4 mr-2" />
                      Login to Accept
                    </>
                  )}
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => router.push('/login')}
                  className="w-full h-12"
                >
                  Decline
                </Button>
              </div>

              {!isAuthenticated && (
                <div className="text-center border-t border-[var(--border)] pt-4 mt-2">
                  <p className="text-[var(--text-secondary)] text-sm">
                    Don't have an account?{' '}
                    <a href={`/signup?redirect=/invite/accept?token=${token}`} className="text-[var(--primary)] hover:underline font-medium">
                      Create account
                    </a>
                  </p>
                </div>
              )}

              {/* Expiration Notice */}
              <p className="text-[var(--text-tertiary)] text-xs text-center flex items-center justify-center gap-1.5 bg-[var(--surface-subtle)] py-2 rounded-lg">
                <Clock className="w-3.5 h-3.5" />
                Expires on {formatDate(invitation.expiresAt)}
              </p>
            </CardContent>
          </Card>
        )}
        
        <div className="mt-8 text-center">
          <p className="text-[var(--text-tertiary)] text-xs">
            &copy; {new Date().getFullYear()} Moil Partners. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" variant="primary" className="mx-auto" />
          <p className="mt-4 text-[var(--text-secondary)]">Loading invitation...</p>
        </div>
      </div>
    }>
      <AcceptInviteContent />
    </Suspense>
  );
}
