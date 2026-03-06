'use client';

import React, { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useToast } from '@/components/ui/toast/use-toast';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Logo from '@/components/ui/Logo';
import { useAuthStore, usePartnerStore } from '@/lib/stores';
import { 
  ArrowLeft, 
  Building2, 
  Copy, 
  Link, 
  Palette, 
  Users, 
  Mail,
  Globe,
  Calendar,
  CheckCircle,
  Clock,
  ExternalLink,
  Shield
} from 'lucide-react';

interface Partner {
  id: string;
  name: string;
  domain: string;
  status: string;
  primary_color: string;
  secondary_color: string;
  logo_url: string | null;
  logo_initial: string;
  program_name: string;
  full_name: string;
  created_at: string;
}

interface Admin {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  global_role: string;
  created_at: string;
}

interface Team {
  id: string;
  name: string;
  domain: string;
  purchased_license_count: number;
  created_at: string;
  license_count?: number;
}

export default function PartnerViewPage() {
  const router = useRouter();
  const params = useParams();
  const partnerId = params.partnerId as string;
  const { toast } = useToast();

  // Zustand stores
  const { isLoading: authLoading, isMoilAdmin, fetchAuth } = useAuthStore();
  const { partnerDetails, detailsLoading, fetchPartnerDetail } = usePartnerStore();

  // Get cached partner detail
  const partnerDetail = partnerDetails[partnerId];
  const isLoading = detailsLoading[partnerId] || false;
  const partner = partnerDetail?.partner || null;
  const admins = partnerDetail?.admins || [];
  const teams = partnerDetail?.teams || [];
  const totalLicenseCount = partnerDetail?.totalLicenseCount || 0;

  // Fetch auth on mount
  useEffect(() => {
    fetchAuth();
  }, [fetchAuth]);

  // Fetch partner detail when authorized
  useEffect(() => {
    if (isMoilAdmin && partnerId) {
      fetchPartnerDetail(partnerId);
    }
  }, [isMoilAdmin, partnerId, fetchPartnerDetail]);

  // Redirect if not authorized
  useEffect(() => {
    if (!authLoading && !isMoilAdmin) {
      router.push('/admin/dashboard');
    }
  }, [authLoading, isMoilAdmin, router]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: `${label} copied to clipboard`,
      type: 'success',
    });
  };

  const getSignupLink = () => {
    if (typeof window !== 'undefined' && partner) {
      return `${window.location.origin}/signup?partnerId=${partner.id}`;
    }
    return '';
  };

  // Redirect if partner not found after loading
  useEffect(() => {
    if (isMoilAdmin && !isLoading && !partner && partnerDetail !== undefined) {
      toast({
        title: 'Error',
        description: 'Partner not found',
        type: 'error',
      });
      router.push('/moil-admin/dashboard');
    }
  }, [isMoilAdmin, isLoading, partner, partnerDetail, router, toast]);

  if (authLoading || !isMoilAdmin || isLoading || !partner) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" variant="primary" className="mx-auto" />
          <p className="mt-4 text-[var(--text-secondary)]">Loading partner details...</p>
        </div>
      </div>
    );
  }

  const hasAdmin = admins.length > 0;

  return (
    <div className="min-h-screen bg-[var(--background)] font-sans text-[var(--text-primary)]">
      {/* Header */}
      <header className="glass-panel border-b border-[var(--border)] sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Logo size="sm" showText={false} />
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)]">Partner Details</h1>
              <p className="text-sm text-[var(--text-secondary)]">{partner.name}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8 max-w-4xl">
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        {/* Partner Header Card */}
        <Card variant="glass" className="mb-6 overflow-hidden">
          <div 
            className="h-24 relative"
            style={{ 
              background: `linear-gradient(135deg, ${partner.primary_color}, ${partner.secondary_color})` 
            }}
          >
            <div className="absolute -bottom-10 left-6">
              {partner.logo_url ? (
                <img 
                  src={partner.logo_url} 
                  alt={partner.name}
                  className="w-20 h-20 rounded-xl border-4 border-[var(--surface)] object-cover shadow-lg"
                />
              ) : (
                <div 
                  className="w-20 h-20 rounded-xl border-4 border-[var(--surface)] flex items-center justify-center text-2xl font-bold text-white shadow-lg"
                  style={{ backgroundColor: partner.primary_color }}
                >
                  {partner.logo_initial}
                </div>
              )}
            </div>
          </div>
          <CardContent className="pt-14 pb-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-[var(--text-primary)]">{partner.name}</h2>
                <p className="text-[var(--text-secondary)] flex items-center gap-2 mt-1">
                  <Globe className="w-4 h-4" />
                  {partner.domain}
                </p>
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                partner.status === 'active' 
                  ? 'bg-green-500/10 text-green-500' 
                  : 'bg-yellow-500/10 text-yellow-500'
              }`}>
                {partner.status === 'active' ? (
                  <span className="flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {partner.status}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card variant="glass" className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-[var(--primary)]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--text-primary)]">{admins.length}</p>
                <p className="text-xs text-[var(--text-tertiary)]">Admins</p>
              </div>
            </div>
          </Card>
          <Card variant="glass" className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--secondary)]/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-[var(--secondary)]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--text-primary)]">{teams.length}</p>
                <p className="text-xs text-[var(--text-tertiary)]">Teams</p>
              </div>
            </div>
          </Card>
          <Card variant="glass" className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-[var(--accent)]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--text-primary)]">{totalLicenseCount}</p>
                <p className="text-xs text-[var(--text-tertiary)]">Licenses</p>
              </div>
            </div>
          </Card>
          <Card variant="glass" className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  {new Date(partner.created_at).toLocaleDateString()}
                </p>
                <p className="text-xs text-[var(--text-tertiary)]">Created</p>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Signup Link Card */}
          <Card variant="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[var(--text-primary)]">
                <Link className="w-5 h-5 text-[var(--primary)]" />
                Partner Signup Link
              </CardTitle>
              <CardDescription>
                {hasAdmin 
                  ? 'An admin has already signed up for this partner'
                  : 'Share this link with the partner admin to create their account'
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {hasAdmin ? (
                <div className="p-4 bg-green-500/5 rounded-xl border border-green-500/20">
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-medium">Admin account created</span>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] mt-2">
                    {admins[0].email} signed up on {new Date(admins[0].created_at).toLocaleDateString()}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-[var(--surface-subtle)] rounded-lg border border-[var(--border)]">
                    <p className="text-xs text-[var(--text-tertiary)] mb-1">Signup URL</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={getSignupLink()}
                        readOnly
                        className="flex-1 bg-transparent text-sm font-mono text-[var(--text-secondary)] truncate outline-none"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(getSignupLink(), 'Signup link')}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    The partner admin will use this link to create their account and will be automatically linked to this partner.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Brand Identity Card */}
          <Card variant="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[var(--text-primary)]">
                <Palette className="w-5 h-5 text-[var(--secondary)]" />
                Brand Identity
              </CardTitle>
              <CardDescription>
                Partner's branding colors and logo
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Logo */}
              <div>
                <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Logo</p>
                <div className="flex items-center gap-4">
                  {partner.logo_url ? (
                    <img 
                      src={partner.logo_url} 
                      alt={partner.name}
                      className="w-16 h-16 rounded-xl border border-[var(--border)] object-cover"
                    />
                  ) : (
                    <div 
                      className="w-16 h-16 rounded-xl border border-[var(--border)] flex items-center justify-center text-xl font-bold text-white"
                      style={{ backgroundColor: partner.primary_color }}
                    >
                      {partner.logo_initial}
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-[var(--text-primary)] font-medium">
                      {partner.logo_url ? 'Custom Logo' : 'Initial Logo'}
                    </p>
                    <p className="text-xs text-[var(--text-tertiary)]">
                      {partner.logo_url ? 'Uploaded by partner' : `Using "${partner.logo_initial}" as fallback`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Colors */}
              <div>
                <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Brand Colors</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-[var(--surface-subtle)] rounded-lg border border-[var(--border)]">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-10 h-10 rounded-lg border border-[var(--border)] shadow-sm"
                        style={{ backgroundColor: partner.primary_color }}
                      />
                      <div>
                        <p className="text-xs text-[var(--text-tertiary)]">Primary</p>
                        <p className="text-sm font-mono text-[var(--text-primary)]">{partner.primary_color}</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 bg-[var(--surface-subtle)] rounded-lg border border-[var(--border)]">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-10 h-10 rounded-lg border border-[var(--border)] shadow-sm"
                        style={{ backgroundColor: partner.secondary_color }}
                      />
                      <div>
                        <p className="text-xs text-[var(--text-tertiary)]">Secondary</p>
                        <p className="text-sm font-mono text-[var(--text-primary)]">{partner.secondary_color}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div>
                <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Gradient Preview</p>
                <div 
                  className="h-16 rounded-xl"
                  style={{ 
                    background: `linear-gradient(135deg, ${partner.primary_color}, ${partner.secondary_color})` 
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Teams Card */}
          <Card variant="glass" className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[var(--text-primary)]">
                <Building2 className="w-5 h-5 text-[var(--secondary)]" />
                Teams
              </CardTitle>
              <CardDescription>
                {teams.length === 0 
                  ? 'No teams created yet - the partner admin needs to create a team first'
                  : `${teams.length} team${teams.length > 1 ? 's' : ''} • ${totalLicenseCount} total licenses`
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {teams.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-[var(--surface-subtle)] flex items-center justify-center mx-auto mb-4">
                    <Building2 className="w-8 h-8 text-[var(--text-tertiary)]" />
                  </div>
                  <p className="text-[var(--text-secondary)]">No teams yet</p>
                  <p className="text-sm text-[var(--text-tertiary)] mt-1">
                    The partner admin will create a team after signing up
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {teams.map((team) => (
                    <div 
                      key={team.id}
                      className="flex items-center justify-between p-4 bg-[var(--surface-subtle)] rounded-xl border border-[var(--border)] hover:border-[var(--primary)]/30 transition-colors cursor-pointer"
                      onClick={() => router.push(`/moil-admin/teams/${team.id}`)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[var(--secondary)]/10 flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-[var(--secondary)]" />
                        </div>
                        <div>
                          <p className="font-medium text-[var(--text-primary)]">{team.name}</p>
                          <p className="text-sm text-[var(--text-secondary)]">{team.domain}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-lg font-bold text-[var(--text-primary)]">{team.license_count || 0}</p>
                          <p className="text-xs text-[var(--text-tertiary)]">Licenses</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/moil-admin/teams/${team.id}`);
                          }}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Admins Card */}
          <Card variant="glass" className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[var(--text-primary)]">
                <Users className="w-5 h-5 text-[var(--accent)]" />
                Partner Admins
              </CardTitle>
              <CardDescription>
                {admins.length === 0 
                  ? 'No admins have signed up yet'
                  : `${admins.length} admin${admins.length > 1 ? 's' : ''} registered`
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {admins.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-[var(--surface-subtle)] flex items-center justify-center mx-auto mb-4">
                    <Mail className="w-8 h-8 text-[var(--text-tertiary)]" />
                  </div>
                  <p className="text-[var(--text-secondary)]">No admins yet</p>
                  <p className="text-sm text-[var(--text-tertiary)] mt-1">
                    Share the signup link above to invite the partner admin
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {admins.map((admin) => (
                    <div 
                      key={admin.id}
                      className="flex items-center justify-between p-4 bg-[var(--surface-subtle)] rounded-xl border border-[var(--border)]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[var(--primary)]/10 flex items-center justify-center">
                          <span className="text-sm font-medium text-[var(--primary)]">
                            {admin.first_name?.[0] || admin.email[0].toUpperCase()}
                            {admin.last_name?.[0] || ''}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-[var(--text-primary)]">
                            {admin.first_name && admin.last_name 
                              ? `${admin.first_name} ${admin.last_name}`
                              : admin.email
                            }
                          </p>
                          <p className="text-sm text-[var(--text-secondary)]">{admin.email}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-[var(--primary)]/10 text-[var(--primary)]">
                          {admin.global_role === 'partner_admin' ? 'Partner Admin' : admin.global_role}
                        </span>
                        <p className="text-xs text-[var(--text-tertiary)] mt-1">
                          Joined {new Date(admin.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
