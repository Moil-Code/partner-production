'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast/use-toast';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Logo from '@/components/ui/Logo';
import { Mail, Lock, Eye, EyeOff, ArrowRight, User, ArrowLeft, Shield, Building2 } from 'lucide-react';

function SignupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  // Get invite parameters from URL
  const inviteToken = searchParams.get('invite');
  const teamId = searchParams.get('team');
  const teamName = searchParams.get('teamName');
  const redirectUrl = searchParams.get('redirect');
  
  // Get partner signup parameters (from Moil admin created partner)
  const partnerId = searchParams.get('partnerId');
  
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [extractedDomain, setExtractedDomain] = useState('');
  const [partnerInfo, setPartnerInfo] = useState<{ name: string; domain: string } | null>(null);
  const [existingPartnerForDomain, setExistingPartnerForDomain] = useState<{ name: string; domain: string } | null>(null);
  const [checkingDomain, setCheckingDomain] = useState(false);
  const [invitationEmail, setInvitationEmail] = useState<string | null>(null);
  const [invitationInfo, setInvitationInfo] = useState<{ team: { id: string; name: string; domain: string } | null; inviter: { first_name: string; last_name: string; email: string } | null } | null>(null);
  const [partnerHasAdmin, setPartnerHasAdmin] = useState(false);
  const [checkingPartnerAdmin, setCheckingPartnerAdmin] = useState(false);
  const [checkingInvitation, setCheckingInvitation] = useState(false);
  const [invitationError, setInvitationError] = useState<string | null>(null);
  const [partnerError, setPartnerError] = useState<string | null>(null);
  
  // Check if this is a partner admin signup (from Moil admin created link)
  const isPartnerAdminSignup = !!partnerId;
  
  // Check if this is an invite signup
  const isInviteSignup = !!inviteToken;
  
  // Check if this is a Moil admin signup (@moilapp.com)
  // Only specific emails can create moil-admin accounts
  const ALLOWED_MOIL_ADMIN_EMAILS = [
    'steve@moilapp.com',
    'andres@moilapp.com',
    'taiwo@moilapp.com',
    'jacob@moilapp.com',
    'ablad@moilapp.com',
  ];
  const isMoilAdminSignup = extractedDomain === 'moilapp.com' && !isPartnerAdminSignup && ALLOWED_MOIL_ADMIN_EMAILS.includes(email.toLowerCase());
  
  // Fetch invitation details if invite token is provided
  React.useEffect(() => {
    if (!inviteToken) return;
    
    let isMounted = true;
    
    const fetchInvitationDetails = async () => {
      setCheckingInvitation(true);
      setInvitationError(null);
      
      try {
        const response = await fetch(`/api/signup/invitation-info?token=${inviteToken}`);
        const data = await response.json();
        
        if (!isMounted) return;
        
        if (!response.ok) {
          setInvitationError(data.error || 'Failed to fetch invitation');
          return;
        }
        
        if (data.invitation) {
          setInvitationEmail(data.invitation.email);
          setInvitationInfo({
            team: data.invitation.team,
            inviter: data.invitation.inviter,
          });
        }
      } catch (error) {
        console.error('Error fetching invitation details:', error);
        if (isMounted) {
          setInvitationError('Failed to load invitation details');
        }
      } finally {
        if (isMounted) {
          setCheckingInvitation(false);
        }
      }
    };
    
    fetchInvitationDetails();
    
    return () => {
      isMounted = false;
    };
  }, [inviteToken]);
  
  // Fetch partner info and check if admin already exists
  React.useEffect(() => {
    if (!partnerId) return;
    
    let isMounted = true;
    
    const fetchPartnerInfo = async () => {
      setCheckingPartnerAdmin(true);
      setPartnerError(null);
      
      try {
        const response = await fetch(`/api/signup/partner-info?partnerId=${partnerId}`);
        const data = await response.json();
        
        if (!isMounted) return;
        
        if (!response.ok) {
          setPartnerError(data.error || 'Failed to fetch partner info');
          return;
        }
        
        if (data.partner) {
          setPartnerInfo(data.partner);
          setOrganizationName(data.partner.name);
        }
        
        setPartnerHasAdmin(data.hasAdmin || false);
      } catch (err) {
        console.error('Error in fetchPartnerInfo:', err);
        if (isMounted) {
          setPartnerError('Failed to load partner information');
        }
      } finally {
        if (isMounted) {
          setCheckingPartnerAdmin(false);
        }
      }
    };
    
    fetchPartnerInfo();
    
    return () => {
      isMounted = false;
    };
  }, [partnerId]);

  // Check if domain already has a partner (for regular signup flow)
  React.useEffect(() => {
    // Only check for regular signup (not partner admin signup, not invite signup, not moil admin)
    if (isPartnerAdminSignup || isInviteSignup || !extractedDomain || extractedDomain === 'moilapp.com') {
      setExistingPartnerForDomain(null);
      return;
    }

    const checkDomainPartner = async () => {
      setCheckingDomain(true);
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('partners')
          .select('name, domain')
          .eq('domain', extractedDomain)
          .single();
        
        if (data) {
          setExistingPartnerForDomain(data);
        } else {
          setExistingPartnerForDomain(null);
        }
      } catch {
        setExistingPartnerForDomain(null);
      } finally {
        setCheckingDomain(false);
      }
    };

    // Debounce the check
    const timeoutId = setTimeout(checkDomainPartner, 500);
    return () => clearTimeout(timeoutId);
  }, [extractedDomain, isPartnerAdminSignup, isInviteSignup]);

  // Extract domain from email
  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (value.includes('@')) {
      const domain = value.split('@')[1];
      setExtractedDomain(domain || '');
    } else {
      setExtractedDomain('');
      setExistingPartnerForDomain(null);
    }
  };

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

    // Validate password length
    if (password.length < 8) {
      toast({
        title: "Weak Password",
        description: "Password must be at least 8 characters long",
        type: "error"
      });
      setLoading(false);
      return;
    }

    // Block partner signup if partner already has an admin
    if (isPartnerAdminSignup && partnerHasAdmin) {
      toast({
        title: "Admin Already Exists",
        description: `${partnerInfo?.name || 'This partner'} already has an admin. Only one admin can sign up per partner. Please contact your organization's existing admin for access.`,
        type: "error"
      });
      setLoading(false);
      return;
    }

    // Validate email domain for partner admin signup
    if (isPartnerAdminSignup) {
      // Wait for partner info to load
      if (!partnerInfo) {
        toast({
          title: "Loading Partner Info",
          description: "Please wait while we load partner information.",
          type: "error"
        });
        setLoading(false);
        return;
      }
      
      const emailDomain = extractedDomain;
      if (emailDomain !== partnerInfo.domain) {
        toast({
          title: "Invalid Email Domain",
          description: `You must use an email address with the domain @${partnerInfo.domain} to sign up for ${partnerInfo.name}`,
          type: "error"
        });
        setLoading(false);
        return;
      }
    }

    // Block signup if domain already has a partner (for regular signup flow)
    if (!isPartnerAdminSignup && !isInviteSignup && !isMoilAdminSignup && existingPartnerForDomain) {
      toast({
        title: "Domain Already Registered",
        description: `The domain @${existingPartnerForDomain.domain} is already registered to ${existingPartnerForDomain.name}. Please contact your organization's admin to be invited to the team.`,
        type: "error"
      });
      setLoading(false);
      return;
    }

    // Validate email matches invitation for invite signup
    if (isInviteSignup && invitationEmail && email.toLowerCase() !== invitationEmail.toLowerCase()) {
      toast({
        title: "Email Mismatch",
        description: `This invitation is for ${invitationEmail}. Please use the correct email address to sign up.`,
        type: "error"
      });
      setLoading(false);
      return;
    }

    // Validate organization name for partner requests (not required for Moil admins or partner admin signup)
    if (!isInviteSignup && !isMoilAdminSignup && !isPartnerAdminSignup && (!organizationName || organizationName.trim().length < 2)) {
      toast({
        title: "Invalid Organization Name",
        description: "Please enter a valid organization name",
        type: "error"
      });
      setLoading(false);
      return;
    }

    try {
      if (isInviteSignup) {
        // Team invite signup - use Supabase auth directly
        const supabase = createClient();
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName,
              last_name: lastName,
              role: 'member',
            },
          },
        });

        if (signUpError) {
          toast({
            title: "Signup Failed",
            description: signUpError.message,
            type: "error"
          });
          console.error("Signup error:", signUpError);
          setLoading(false);
          return;
        }

        if (!data.user) {
          toast({
            title: "Signup Failed",
            description: "Failed to create user",
            type: "error"
          });
          setLoading(false);
          return;
        }

        toast({
          title: "Account Created",
          description: "Account created successfully! Redirecting to login...",
          type: "success"
        });

        setTimeout(() => {
          router.push(`/login?redirect=/invite/accept?token=${inviteToken}`);
        }, 2000);
      } else if (isPartnerAdminSignup && partnerId) {
        // Partner admin signup - link to existing partner created by Moil admin
        const supabase = createClient();
        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName,
              last_name: lastName,
              role: 'partner_admin',
            },
          },
        });

        if (signUpError) {
          toast({
            title: "Signup Failed",
            description: signUpError.message,
            type: "error"
          });
          console.error("Signup error:", signUpError);
          setLoading(false);
          return;
        }

        if (!authData.user) {
          toast({
            title: "Signup Failed",
            description: "Failed to create user account",
            type: "error"
          });
          setLoading(false);
          return;
        }

        // Update admin record to link to the partner (record was auto-created by trigger)
        const { error: adminError } = await supabase
          .from('admins')
          .upsert({
            id: authData.user.id,
            email: email,
            first_name: firstName,
            last_name: lastName,
            global_role: 'partner_admin',
            partner_id: partnerId,
          }, {
            onConflict: 'id'
          });

        if (adminError) {
          console.error("Admin creation error:", adminError);
          toast({
            title: "Account Created",
            description: "Your account was created but there was an issue linking to the partner. Please contact support.",
            type: "warning"
          });
        } else {
          toast({
            title: "Account Created!",
            description: `Your account has been created and linked to ${partnerInfo?.name || 'your organization'}. You can now sign in.`,
            type: "success"
          });
        }

        setTimeout(() => {
          router.push('/login');
        }, 2000);
      } else if (isMoilAdminSignup) {
        // Moil admin signup - direct signup without partner creation
        const supabase = createClient();
        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              role: 'moil_admin',
            },
          },
        });

        if (signUpError) {
          toast({
            title: "Signup Failed",
            description: signUpError.message,
            type: "error"
          });
          console.error("Signup error:", signUpError);
          setLoading(false);
          return;
        }

        if (!authData.user) {
          toast({
            title: "Signup Failed",
            description: "Failed to create user account",
            type: "error"
          });
          setLoading(false);
          return;
        }

        // Update admin record with moil_admin role (record was auto-created by trigger)
        const { error: adminError } = await supabase
          .from('admins')
          .upsert({
            id: authData.user.id,
            email: email,
            global_role: 'moil_admin',
            partner_id: null,
          }, {
            onConflict: 'id'
          });

        if (adminError) {
          console.error("Admin creation error:", adminError);
          // Don't fail - the user is created, they can still log in
        }

        toast({
          title: "Account Created!",
          description: "Your Moil admin account has been created. You can now sign in.",
          type: "success"
        });

        setTimeout(() => {
          router.push('/login');
        }, 2000);
      } else {
       // Partner access request flow:
        // 1. First, check if domain is already registered to prevent orphaned auth accounts
        const supabase = createClient();
        const emailDomain = extractedDomain;
        
        const { data: existingPartner } = await supabase
          .from('partners')
          .select('name, domain')
          .eq('domain', emailDomain)
          .single();
        
        if (existingPartner) {
          toast({
            title: "Domain Already Registered",
            description: `The domain @${existingPartner.domain} is already registered to ${existingPartner.name}. Please contact your organization's admin to be invited to the team.`,
            type: "error"
          });
          setLoading(false);
          return;
        }
        
        // 2. Sign up the user with Supabase Auth
        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              organization_name: organizationName.trim(),
              role: 'partner_admin',
            },
          },
        });

        if (signUpError) {
          toast({
            title: "Signup Failed",
            description: signUpError.message,
            type: "error"
          });
          console.error("Signup error:", signUpError);
          setLoading(false);
          return;
        }

        if (!authData.user) {
          toast({
            title: "Signup Failed",
            description: "Failed to create user account",
            type: "error"
          });
          setLoading(false);
          return;
        }

        // 2. Then, create the partner with pending status via API
        const response = await fetch('/api/partners/request-access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organizationName: organizationName.trim(),
            email,
            userId: authData.user.id,
          }),
        });

        const data = await response.json();
        console.log(data);

        if (data.error) {
          // Partner creation failed - show error toast
          toast({
            title: "Request Failed",
            description: data.error || "Failed to submit access request. Please try again.",
            type: "error"
          });
          console.error("Partner request error:", data.error);
          setLoading(false);
          return;
        }

        toast({
          title: "Account Created!",
          description: "Your partner access request has been submitted and is pending approval. You'll receive an email once approved.",
          type: "success"
        });

        setTimeout(() => {
          if (redirectUrl) {
            router.push(`/login?redirect=${encodeURIComponent(redirectUrl)}`);
          } else {
            router.push('/login');
          }
        }, 2000);
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

      <div className="container mx-auto px-4 relative z-10 py-12">
        <div className="w-full max-w-lg mx-auto">
          {/* Logo Section */}
          <div className="text-center mb-8 animate-fade-in">
            <Link href="/" className="inline-block group">
                <div className="flex items-center justify-center mb-4">
                    <Logo size="lg" />
                </div>
            </Link>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">
              {isInviteSignup ? 'Create Account' : isPartnerAdminSignup ? 'Partner Admin Signup' : isMoilAdminSignup ? 'Moil Admin Signup' : 'Request Partner Access'}
            </h1>
            <p className="text-[var(--text-secondary)] text-sm mt-1">
              {isInviteSignup ? 'Create your account to join the team' : isPartnerAdminSignup ? `Create your admin account for ${partnerInfo?.name || 'your organization'}` : isMoilAdminSignup ? 'Create your Moil admin account' : 'Submit your organization details to request access'}
            </p>
          </div>

          {/* Partner Admin Signup Banner */}
          {isPartnerAdminSignup && partnerInfo && (
            <div className="bg-gradient-to-r from-[var(--primary)] to-[var(--primary-600)] rounded-xl p-5 mb-6 text-white animate-fade-in shadow-lg border border-white/10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm shadow-sm">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-white/80 text-sm font-medium">You're joining as admin for</p>
                  <p className="text-xl font-bold tracking-tight">{partnerInfo.name}</p>
                  <p className="text-white/60 text-xs font-mono mt-1">{partnerInfo.domain}</p>
                </div>
              </div>
            </div>
          )}

          {/* Partner Admin Already Exists Warning */}
          {isPartnerAdminSignup && partnerHasAdmin && !checkingPartnerAdmin && (
            <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-xl p-5 mb-6 text-white animate-fade-in shadow-lg border border-white/10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm shadow-sm">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-white font-bold">Admin Already Registered</p>
                  <p className="text-white/80 text-sm mt-1">
                    {partnerInfo?.name || 'This partner'} already has an admin. Only one admin can sign up per partner link.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Partner Domain Mismatch Warning */}
          {isPartnerAdminSignup && partnerInfo && extractedDomain && extractedDomain !== partnerInfo.domain && (
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-xl p-5 mb-6 text-white animate-fade-in shadow-lg border border-white/10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm shadow-sm">
                  <Mail className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-white font-bold">Invalid Email Domain</p>
                  <p className="text-white/80 text-sm mt-1">
                    You must use an email with domain <span className="font-mono bg-black/20 px-1.5 py-0.5 rounded">@{partnerInfo.domain}</span> to sign up for {partnerInfo.name}.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Partner Error Banner */}
          {isPartnerAdminSignup && partnerError && !checkingPartnerAdmin && (
            <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-xl p-5 mb-6 text-white animate-fade-in shadow-lg border border-white/10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm shadow-sm">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-white font-bold">Error Loading Partner</p>
                  <p className="text-white/80 text-sm mt-1">{partnerError}</p>
                </div>
              </div>
            </div>
          )}

          {/* Invitation Error Banner */}
          {isInviteSignup && invitationError && !checkingInvitation && (
            <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-xl p-5 mb-6 text-white animate-fade-in shadow-lg border border-white/10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm shadow-sm">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-white font-bold">Invalid Invitation</p>
                  <p className="text-white/80 text-sm mt-1">{invitationError}</p>
                </div>
              </div>
            </div>
          )}

          {/* Team Invite Banner */}
          {isInviteSignup && (invitationInfo?.team || teamName) && !invitationError && (
            <div className="bg-gradient-to-r from-[var(--primary)] to-[var(--primary-600)] rounded-xl p-5 mb-6 text-white animate-fade-in shadow-lg border border-white/10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm shadow-sm">
                  <User className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-white/80 text-sm font-medium">You're joining</p>
                  <p className="text-xl font-bold tracking-tight">{invitationInfo?.team?.name || (teamName ? decodeURIComponent(teamName) : 'Team')}</p>
                  {invitationEmail && (
                    <p className="text-white/70 text-xs mt-1">
                      Invitation sent to: <span className="font-mono bg-black/20 px-1.5 py-0.5 rounded">{invitationEmail}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Team Invite Email Mismatch Warning */}
          {isInviteSignup && invitationEmail && email && email.toLowerCase() !== invitationEmail.toLowerCase() && (
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-xl p-5 mb-6 text-white animate-fade-in shadow-lg border border-white/10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm shadow-sm">
                  <Mail className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-white font-bold">Email Mismatch</p>
                  <p className="text-white/80 text-sm mt-1">
                    This invitation is for <span className="font-mono bg-black/20 px-1.5 py-0.5 rounded">{invitationEmail}</span>. 
                    Please use this email to sign up.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Signup Card */}
          <Card variant="glass" className="border-t-4 border-t-[var(--primary)] shadow-2xl">
            <CardContent className="p-8">
              <form onSubmit={handleSubmit} className="space-y-5">
                {(isInviteSignup || isPartnerAdminSignup) ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">First Name</label>
                      <input 
                        type="text" 
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full px-4 py-3 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
                        placeholder="Jane"
                        required
                        disabled={loading}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Last Name</label>
                      <input 
                        type="text" 
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full px-4 py-3 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
                        placeholder="Doe"
                        required
                        disabled={loading}
                      />
                    </div>
                  </div>
                ) : !isMoilAdminSignup ? (
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Organization Name</label>
                    <div className="relative group">
                      <input 
                        type="text" 
                        value={organizationName}
                        onChange={(e) => setOrganizationName(e.target.value)}
                        className="w-full px-4 py-3 pl-11 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
                        placeholder="Acme Corporation"
                        required
                        disabled={loading}
                      />
                      <Building2 className="w-5 h-5 text-[var(--text-tertiary)] absolute left-3.5 top-3.5 group-focus-within:text-[var(--primary)] transition-colors" />
                    </div>
                  </div>
                ) : null}

                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                    {isInviteSignup ? 'Work Email' : 'Email Address'}
                    {isPartnerAdminSignup && partnerInfo && (
                      <span className="ml-2 text-xs text-[var(--accent)] font-normal">
                        (must be @{partnerInfo.domain})
                      </span>
                    )}
                    {isInviteSignup && invitationEmail && (
                      <span className="ml-2 text-xs text-[var(--accent)] font-normal">
                        (invitation sent to {invitationEmail})
                      </span>
                    )}
                  </label>
                  <div className="relative group">
                    <input 
                      type="email" 
                      value={email}
                      onChange={(e) => handleEmailChange(e.target.value)}
                      className="w-full px-4 py-3 pl-11 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
                      placeholder={isInviteSignup && invitationEmail ? invitationEmail : isPartnerAdminSignup && partnerInfo ? `name@${partnerInfo.domain}` : "name@company.com"}
                      required
                      disabled={loading}
                    />
                    <Mail className="w-5 h-5 text-[var(--text-tertiary)] absolute left-3.5 top-3.5 group-focus-within:text-[var(--primary)] transition-colors" />
                  </div>
                  {isInviteSignup && invitationEmail && email && (
                    <p className={`mt-2 text-xs flex items-center gap-1.5 px-3 py-2 rounded-lg border ${
                      email.toLowerCase() === invitationEmail.toLowerCase()
                        ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
                        : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
                    }`}>
                      {email.toLowerCase() === invitationEmail.toLowerCase() ? (
                        <>
                          <Shield className="w-3.5 h-3.5" />
                          Email matches invitation
                        </>
                      ) : (
                        <>
                          <Shield className="w-3.5 h-3.5" />
                          Email must match invitation: {invitationEmail}
                        </>
                      )}
                    </p>
                  )}
                  {isPartnerAdminSignup && partnerInfo && extractedDomain && (
                    <p className={`mt-2 text-xs flex items-center gap-1.5 px-3 py-2 rounded-lg border ${
                      extractedDomain === partnerInfo.domain 
                        ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
                        : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
                    }`}>
                      <span className="font-medium">
                        {extractedDomain === partnerInfo.domain ? '✓ Valid domain' : '✗ Invalid domain'}
                      </span>
                      <code className="font-mono px-2 py-0.5 rounded bg-black/5 dark:bg-white/5">{extractedDomain}</code>
                    </p>
                  )}
                  {!isInviteSignup && !isPartnerAdminSignup && extractedDomain && (
                    checkingDomain ? (
                      <p className="mt-2 text-xs text-[var(--text-secondary)] flex items-center gap-1.5 bg-[var(--surface-subtle)] px-3 py-2 rounded-lg border border-[var(--border)]">
                        <span className="animate-pulse">Checking domain...</span>
                      </p>
                    ) : existingPartnerForDomain ? (
                      <div className="mt-2 text-xs bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-3 py-2 rounded-lg">
                        <p className="font-medium flex items-center gap-1.5">
                          <span>✗</span> Domain already registered to <strong>{existingPartnerForDomain.name}</strong>
                        </p>
                        <p className="mt-1 text-red-600 dark:text-red-300">
                          Contact your organization's admin to be invited to the team.
                        </p>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-[var(--text-secondary)] flex items-center gap-1.5 bg-[var(--surface-subtle)] px-3 py-2 rounded-lg border border-[var(--border)]">
                        <span className="font-medium">Domain:</span>
                        <code className="text-[var(--secondary)] font-mono bg-[var(--secondary)]/5 px-2 py-0.5 rounded">{extractedDomain}</code>
                      </p>
                    )
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Create Password</label>
                  <div className="relative group">
                    <input 
                      type={showPassword ? "text" : "password"} 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 pl-11 pr-12 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
                      placeholder="Min. 8 characters"
                      required
                      minLength={8}
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

                {isPartnerAdminSignup && (
                  <div className="bg-[var(--accent)]/5 p-4 rounded-xl border border-[var(--accent)]/10">
                    <div className="flex gap-3">
                        <Shield className="w-5 h-5 text-[var(--accent)] flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                            Your account will be automatically linked to <strong>{partnerInfo?.name || 'your organization'}</strong>. You'll be able to manage licenses and team members after signing in.
                        </p>
                    </div>
                  </div>
                )}

                {!isInviteSignup && !isMoilAdminSignup && !isPartnerAdminSignup && (
                  <div className="bg-[var(--primary)]/5 p-4 rounded-xl border border-[var(--primary)]/10">
                    <div className="flex gap-3">
                        <Shield className="w-5 h-5 text-[var(--primary)] flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                            Partner access requests require approval from Moil admins. You will receive an email once your organization has been verified and approved.
                        </p>
                    </div>
                  </div>
                )}
                
                {isMoilAdminSignup && (
                  <div className="bg-[var(--secondary)]/5 p-4 rounded-xl border border-[var(--secondary)]/10">
                    <div className="flex gap-3">
                        <Shield className="w-5 h-5 text-[var(--secondary)] flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                            You're signing up as a Moil admin. You'll have access to manage all partners and licenses from the Moil Admin Dashboard.
                        </p>
                    </div>
                  </div>
                )}

                <Button 
                  type="submit"
                  disabled={
                    loading || 
                    checkingPartnerAdmin || 
                    checkingInvitation ||
                    (isPartnerAdminSignup && !partnerInfo) || 
                    (isPartnerAdminSignup && !!partnerError) ||
                    (isPartnerAdminSignup && partnerHasAdmin) || 
                    (isPartnerAdminSignup && !!partnerInfo && extractedDomain !== partnerInfo.domain) ||
                    (isInviteSignup && !invitationEmail) ||
                    (isInviteSignup && !!invitationError) ||
                    (isInviteSignup && !!invitationEmail && email.toLowerCase() !== invitationEmail.toLowerCase())
                  }
                  className="w-full h-12 text-base shadow-lg shadow-[var(--primary)]/20"
                  loading={loading || checkingPartnerAdmin || checkingInvitation}
                >
                  {loading ? (isInviteSignup || isPartnerAdminSignup ? 'Creating Account...' : isMoilAdminSignup ? 'Creating Account...' : 'Submitting Request...') : (
                    <>
                      <span>{isInviteSignup || isPartnerAdminSignup ? 'Create Account' : isMoilAdminSignup ? 'Create Account' : 'Request Access'}</span>
                      <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-8 pt-6 border-t border-[var(--border)] text-center">
                <p className="text-sm text-[var(--text-secondary)]">
                  Already have an account? <Link href="/login" className="text-[var(--primary)] font-semibold hover:underline">Sign In</Link>
                </p>
              </div>
            </CardContent>
          </Card>
          
          <div className="mt-8 text-center pb-8">
            <Link href="/login" className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-sm transition-colors flex items-center justify-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                {isInviteSignup ? 'Return to Login' : 'Return to Login'}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminSignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" variant="primary" className="mx-auto" />
          <p className="mt-4 text-[var(--text-secondary)]">Loading...</p>
        </div>
      </div>
    }>
      <SignupContent />
    </Suspense>
  );
}
