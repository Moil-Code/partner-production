'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast/use-toast';
import Logo from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { useAuthStore, usePartnerStore, useTeamStore, useUIStore } from '@/lib/stores';
import { 
  Building2, 
  TrendingUp, 
  Plus,
  Shield,
  LogOut,
  Search,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Eye,
  Key,
  Users2,
  LayoutDashboard,
  Activity,
  X
} from 'lucide-react';

interface Partner {
  id: string;
  name: string;
  domain: string;
  status: string;
  created_at: string;
}

interface Stats {
  total_partners: number;
  active_partners: number;
  pending_partners: number;
  total_licenses: number;
  total_teams: number;
  total_admins: number;
}

interface Team {
  id: string;
  name: string;
  domain: string;
  partner_id: string;
  partner_name?: string;
  created_at: string;
  member_count?: number;
  license_count?: number;
  purchased_license_count?: number;
}

type TabType = 'overview' | 'partners' | 'teams' | 'licenses';

export default function MoilAdminDashboard() {
  const router = useRouter();
  const { toast } = useToast();
  
  // Zustand stores
  const { admin, isLoading: authLoading, isMoilAdmin, fetchAuth } = useAuthStore();
  const { partners, stats, isLoading: partnersLoading, fetchPartners, updatePartnerStatus, invalidateAll: invalidatePartners } = usePartnerStore();
  const { teams, isLoading: teamsLoading, fetchTeams } = useTeamStore();
  const { moilAdminActiveTab: activeTab, moilAdminSearchQuery: searchQuery, setMoilAdminActiveTab: setActiveTab, setMoilAdminSearchQuery: setSearchQuery } = useUIStore();
  
  const [updatingStatus, setUpdatingStatus] = React.useState<string | null>(null);
  const [showAddLicenseModal, setShowAddLicenseModal] = React.useState(false);
  const [licenseEmail, setLicenseEmail] = React.useState('');
  const [addingLicense, setAddingLicense] = React.useState(false);
  const [licenses, setLicenses] = React.useState<any[]>([]);
  const [licensesLoading, setLicensesLoading] = React.useState(false);
  
  // Confirmation modal state
  const [confirmModal, setConfirmModal] = React.useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    variant: 'danger' | 'warning';
    confirmText: string;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {},
    variant: 'danger',
    confirmText: 'Confirm',
  });

  // Fetch auth and data on mount
  useEffect(() => {
    fetchAuth();
  }, [fetchAuth]);

  // Fetch data when authorized
  useEffect(() => {
    if (isMoilAdmin) {
      fetchPartners();
      fetchTeams();
    }
  }, [isMoilAdmin, fetchPartners, fetchTeams]);

  // Redirect if not authorized
  useEffect(() => {
    if (!authLoading && admin && !isMoilAdmin) {
      toast({
        title: 'Access Denied',
        description: 'This dashboard is only accessible to Moil admins',
        type: 'error',
      });
      router.push('/admin/dashboard');
    }
  }, [authLoading, admin, isMoilAdmin, router, toast]);

  // Fetch licenses when licenses tab is active
  useEffect(() => {
    if (isMoilAdmin && activeTab === 'licenses' && admin?.id) {
      fetchLicenses();
    }
  }, [isMoilAdmin, activeTab, admin?.id]);

  const fetchLicenses = async () => {
    setLicensesLoading(true);
    try {
      const response = await fetch(`/api/licenses?adminId=${admin?.id}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch licenses');
      }
      
      setLicenses(data.licenses || []);
    } catch (error) {
      console.error('Error fetching licenses:', error);
      toast({
        title: 'Error',
        description: 'Failed to load licenses',
        type: 'error',
      });
    } finally {
      setLicensesLoading(false);
    }
  };


  const handleToggleStatus = (partner: Partner) => {
    const newStatus = partner.status === 'active' ? 'suspended' : 'active';
    
    if (newStatus === 'suspended') {
      // Show confirmation for suspend action
      setConfirmModal({
        isOpen: true,
        title: 'Suspend Partner',
        description: `Are you sure you want to suspend ${partner.name}? This will prevent them from accessing the platform.`,
        confirmText: 'Suspend',
        variant: 'warning',
        onConfirm: () => executeToggleStatus(partner),
      });
    } else {
      // Activate without confirmation
      executeToggleStatus(partner);
    }
  };

  const executeToggleStatus = async (partner: Partner) => {
    setConfirmModal({ ...confirmModal, isOpen: false });
    setUpdatingStatus(partner.id);
    try {
      const supabase = createClient();
      const newStatus = partner.status === 'active' ? 'suspended' : 'active';
      
      const { error } = await supabase
        .from('partners')
        .update({ status: newStatus })
        .eq('id', partner.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Partner ${newStatus === 'active' ? 'activated' : 'suspended'} successfully`,
        type: 'success',
      });

      invalidatePartners();
      fetchPartners();
    } catch (error) {
      console.error('Error updating partner status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update partner status',
        type: 'error',
      });
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleApprovePartner = async (partner: Partner) => {
    setUpdatingStatus(partner.id);
    try {
      // Call API to approve partner and send email notifications
      const response = await fetch(`/api/partners/${partner.id}/approve`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to approve partner');
      }

      toast({
        title: 'Partner Approved!',
        description: `${partner.name} has been approved. Approval emails sent to admins from ${partner.domain}.`,
        type: 'success',
      });

      invalidatePartners();
      fetchPartners();
    } catch (error) {
      console.error('Error approving partner:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to approve partner',
        type: 'error',
      });
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleRejectPartner = (partner: Partner) => {
    setConfirmModal({
      isOpen: true,
      title: 'Reject Partner',
      description: `Are you sure you want to reject ${partner.name}? This action cannot be undone and will permanently delete their access request.`,
      confirmText: 'Reject',
      variant: 'danger',
      onConfirm: () => executeRejectPartner(partner),
    });
  };

  const executeRejectPartner = async (partner: Partner) => {
    setConfirmModal({ ...confirmModal, isOpen: false });
    setUpdatingStatus(partner.id);
    try {
      const supabase = createClient();
      
      // Delete the partner record (rejection)
      const { error } = await supabase
        .from('partners')
        .delete()
        .eq('id', partner.id);

      if (error) throw error;

      toast({
        title: 'Partner Rejected',
        description: `${partner.name} access request has been rejected.`,
        type: 'success',
      });

      invalidatePartners();
      fetchPartners();
    } catch (error) {
      console.error('Error rejecting partner:', error);
      toast({
        title: 'Error',
        description: 'Failed to reject partner',
        type: 'error',
      });
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleAddLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseEmail.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please enter an email address',
        type: 'error',
      });
      return;
    }

    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(licenseEmail)) {
      toast({
        title: 'Invalid Email',
        description: 'Please enter a valid email address',
        type: 'error',
      });
      return;
    }

    if (!admin?.id) {
      toast({
        title: 'Error',
        description: 'Admin information not available',
        type: 'error',
      });
      return;
    }

    setAddingLicense(true);
    try {
      const response = await fetch('/api/licenses/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: licenseEmail.trim().toLowerCase(),
          adminId: admin.id,
        }),
      });

      const data = await response.json();

      if (data.error) {
        toast({
          title: 'Error',
          description: data.error,
          type: 'error',
        });
        return;
      }

      toast({
        title: 'License Added',
        description: `License created and activation email sent to ${licenseEmail}`,
        type: 'success',
      });

      setLicenseEmail('');
      setShowAddLicenseModal(false);
      
      // Refresh licenses list if on licenses tab
      if (activeTab === 'licenses') {
        fetchLicenses();
      }
    } catch (error) {
      console.error('Error adding license:', error);
      toast({
        title: 'Error',
        description: 'Failed to add license',
        type: 'error',
      });
    } finally {
      setAddingLicense(false);
    }
  };

  const handleLogout = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Logout',
      description: 'Are you sure you want to logout? You will need to sign in again to access the dashboard.',
      confirmText: 'Logout',
      variant: 'warning',
      onConfirm: executeLogout,
    });
  };

  const executeLogout = async () => {
    setConfirmModal({ ...confirmModal, isOpen: false });
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  const filteredPartners = partners.filter(p => {
    const query = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(query) ||
           p.domain.toLowerCase().includes(query);
  });

  if (authLoading || (isMoilAdmin && partnersLoading && partners.length === 0)) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" variant="primary" className="mx-auto" />
          <p className="mt-4 text-[var(--text-secondary)]">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isMoilAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[var(--background)] font-sans text-[var(--text-primary)]">
      {/* Header */}
      <header className="bg-[var(--surface)]/80 backdrop-blur-xl border-b border-[var(--border)] sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6">
          <div className="flex items-center justify-between h-20">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-4">
                <Logo size="sm" showText={false} />
                <div>
                  <h1 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2 leading-tight">
                    <Shield className="w-5 h-5 text-[var(--primary)]" />
                    Moil Admin
                  </h1>
                  <p className="text-xs text-[var(--text-secondary)] font-medium">Platform Administration</p>
                </div>
              </div>
              
              <div className="hidden md:block h-8 w-[1px] bg-[var(--border)]" />
              
              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <span className="bg-[var(--surface-subtle)] px-2 py-1 rounded-md border border-[var(--border)]">{admin?.email}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <ThemeToggle variant="dropdown" className="w-36" />
              
              <div className="h-6 w-[1px] bg-[var(--border)] mx-1" />
              
              <Button 
                variant="ghost" 
                onClick={handleLogout} 
                className="text-[var(--text-secondary)] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
          
          {/* Navigation Tabs - integrated into header bottom */}
          <div className="flex items-center gap-1 -mb-px pt-2">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                activeTab === 'overview'
                  ? 'border-[var(--primary)] text-[var(--primary)]'
                  : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]/50 rounded-t-lg'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Overview
            </button>
            <button
              onClick={() => setActiveTab('partners')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                activeTab === 'partners'
                  ? 'border-[var(--primary)] text-[var(--primary)]'
                  : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]/50 rounded-t-lg'
              }`}
            >
              <Building2 className="w-4 h-4" />
              Partners
              {stats?.pending_partners ? (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-[var(--warning)] text-white rounded-full shadow-sm">
                  {stats.pending_partners}
                </span>
              ) : null}
            </button>
            <button
              onClick={() => setActiveTab('teams')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                activeTab === 'teams'
                  ? 'border-[var(--primary)] text-[var(--primary)]'
                  : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]/50 rounded-t-lg'
              }`}
            >
              <Users2 className="w-4 h-4" />
              Teams
            </button>
            <button
              onClick={() => setActiveTab('licenses')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                activeTab === 'licenses'
                  ? 'border-[var(--primary)] text-[var(--primary)]'
                  : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]/50 rounded-t-lg'
              }`}
            >
              <Key className="w-4 h-4" />
              Licenses
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-6 py-8">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <Card variant="glass" className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[var(--text-secondary)] mb-1">Total Partners</p>
                      <p className="text-3xl font-bold text-[var(--text-primary)]">{stats?.total_partners || 0}</p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-light)] flex items-center justify-center shadow-lg">
                      <Building2 className="w-6 h-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card variant="glass" className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[var(--text-secondary)] mb-1">Active Partners</p>
                      <p className="text-3xl font-bold text-[var(--accent)]">{stats?.active_partners || 0}</p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--accent)] to-emerald-400 flex items-center justify-center shadow-lg">
                      <TrendingUp className="w-6 h-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card variant="glass" className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[var(--text-secondary)] mb-1">Total Teams</p>
                      <p className="text-3xl font-bold text-[var(--info)]">{stats?.total_teams || 0}</p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--info)] to-blue-400 flex items-center justify-center shadow-lg">
                      <Users2 className="w-6 h-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card variant="glass" className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[var(--text-secondary)] mb-1">Total Licenses</p>
                      <p className="text-3xl font-bold text-[var(--secondary)]">{stats?.total_licenses || 0}</p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--secondary)] to-orange-400 flex items-center justify-center shadow-lg">
                      <Key className="w-6 h-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Pending Partner Requests */}
            {partners.filter(p => p.status === 'pending').length > 0 && (
              <Card variant="glass" className="mb-8 border-l-4 border-l-[var(--warning)]">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[var(--warning)]/10 flex items-center justify-center">
                      <AlertCircle className="w-5 h-5 text-[var(--warning)]" />
                    </div>
                    <div>
                      <CardTitle className="text-[var(--text-primary)]">Pending Partner Requests</CardTitle>
                      <CardDescription>Review and approve new partner access requests</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {partners.filter(p => p.status === 'pending').map((partner) => (
                      <div key={partner.id} className="flex items-center justify-between p-4 bg-[var(--surface-subtle)] rounded-xl border border-[var(--border)]">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                            <Building2 className="w-6 h-6 text-[var(--primary)]" />
                          </div>
                          <div>
                            <p className="font-semibold text-[var(--text-primary)]">{partner.name}</p>
                            <p className="text-sm text-[var(--text-secondary)]">
                              <span className="font-mono bg-[var(--primary)]/10 px-2 py-0.5 rounded text-[var(--primary)]">{partner.domain}</span>
                              <span className="mx-2">•</span>
                              Requested {new Date(partner.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRejectPartner(partner)}
                            disabled={updatingStatus === partner.id}
                            className="text-[var(--error)] border-[var(--error)]/30 hover:bg-[var(--error)]/10"
                          >
                            <XCircle className="w-4 h-4 mr-2" />
                            Reject
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleApprovePartner(partner)}
                            disabled={updatingStatus === partner.id}
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Approve
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <Card 
                variant="glass" 
                className="cursor-pointer hover:shadow-lg transition-all hover:border-[var(--primary)]/30"
                onClick={() => router.push('/moil-admin/create-partner')}
              >
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center">
                      <Plus className="w-6 h-6 text-[var(--primary)]" />
                    </div>
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">Add Partner</p>
                      <p className="text-sm text-[var(--text-secondary)]">Create new partner</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card 
                variant="glass" 
                className="cursor-pointer hover:shadow-lg transition-all hover:border-[var(--primary)]/30"
                onClick={() => setActiveTab('partners')}
              >
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-[var(--accent)]" />
                    </div>
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">Manage Partners</p>
                      <p className="text-sm text-[var(--text-secondary)]">View all partners</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card 
                variant="glass" 
                className="cursor-pointer hover:shadow-lg transition-all hover:border-[var(--primary)]/30"
                onClick={() => setActiveTab('teams')}
              >
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[var(--info)]/10 flex items-center justify-center">
                      <Users2 className="w-6 h-6 text-[var(--info)]" />
                    </div>
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">View Teams</p>
                      <p className="text-sm text-[var(--text-secondary)]">Browse all teams</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card 
                variant="glass" 
                className="cursor-pointer hover:shadow-lg transition-all hover:border-[var(--secondary)]/30"
                onClick={() => setShowAddLicenseModal(true)}
              >
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[var(--secondary)]/10 flex items-center justify-center">
                      <Key className="w-6 h-6 text-[var(--secondary)]" />
                    </div>
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">Add License</p>
                      <p className="text-sm text-[var(--text-secondary)]">Create new license</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity */}
            <Card variant="glass">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Activity className="w-5 h-5 text-[var(--primary)]" />
                  <CardTitle className="text-[var(--text-primary)]">Recent Partners</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {partners.slice(0, 5).map((partner) => (
                    <div key={partner.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-[var(--surface-subtle)] transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center text-[var(--primary)] font-bold">
                          {partner.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-[var(--text-primary)]">{partner.name}</p>
                          <p className="text-xs text-[var(--text-tertiary)]">{partner.domain}</p>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        partner.status === 'active' 
                          ? 'bg-[var(--accent)]/10 text-[var(--accent)]' 
                          : partner.status === 'pending'
                          ? 'bg-[var(--warning)]/10 text-[var(--warning)]'
                          : 'bg-[var(--text-muted)]/10 text-[var(--text-muted)]'
                      }`}>
                        {partner.status}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Partners Tab */}
        {activeTab === 'partners' && (
          <Card variant="glass">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-[var(--text-primary)]">Partners</CardTitle>
                  <CardDescription>Manage all partner organizations</CardDescription>
                </div>
                <Button onClick={() => router.push('/moil-admin/create-partner')}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Partner
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Search */}
              <div className="mb-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-tertiary)]" />
                  <input
                    type="text"
                    placeholder="Search partners..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
                  />
                </div>
              </div>

              {/* Partners Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-[var(--text-secondary)]">Partner</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-[var(--text-secondary)]">Domain</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-[var(--text-secondary)]">Status</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-[var(--text-secondary)]">Created</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-[var(--text-secondary)]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPartners.map((partner) => (
                      <tr key={partner.id} className="border-b border-[var(--border)] hover:bg-[var(--surface-subtle)] transition-colors">
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center text-[var(--primary)] font-bold">
                              {partner.name.charAt(0)}
                            </div>
                            <p className="font-medium text-[var(--text-primary)]">{partner.name}</p>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <span className="font-mono text-sm bg-[var(--surface-subtle)] px-2 py-1 rounded text-[var(--text-secondary)]">{partner.domain}</span>
                        </td>
                        <td className="py-4 px-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                            partner.status === 'active' 
                              ? 'bg-[var(--accent)]/10 text-[var(--accent)]' 
                              : partner.status === 'pending'
                              ? 'bg-[var(--warning)]/10 text-[var(--warning)]'
                              : 'bg-[var(--text-muted)]/10 text-[var(--text-muted)]'
                          }`}>
                            {partner.status}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-[var(--text-secondary)] text-sm">
                          {new Date(partner.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-4 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => router.push(`/moil-admin/partners/${partner.id}`)}
                              className="hover:bg-[var(--primary)]/10 hover:text-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 focus:outline-none active:scale-95 transition-all"
                            >
                              View Details
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => router.push(`/moil-admin/licenses?partnerId=${partner.id}`)}
                              className="hover:bg-[var(--secondary)]/10 hover:text-[var(--secondary)] focus:ring-2 focus:ring-[var(--secondary)]/20 focus:outline-none active:scale-95 transition-all"
                            >
                              <Key className="w-4 h-4 mr-1" />
                              View Licenses
                            </Button>
                            {partner.status === 'pending' ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRejectPartner(partner)}
                                  disabled={updatingStatus === partner.id}
                                  className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20 focus:ring-2 focus:ring-red-500/20 focus:outline-none active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Reject
                                </Button>
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => handleApprovePartner(partner)}
                                  disabled={updatingStatus === partner.id}
                                  className="bg-green-600 hover:bg-green-700 text-white focus:ring-2 focus:ring-green-500/20 focus:outline-none active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Approve Partner
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant={partner.status === 'active' ? 'outline' : 'primary'}
                                size="sm"
                                onClick={() => handleToggleStatus(partner)}
                                disabled={updatingStatus === partner.id}
                                className={partner.status === 'active' 
                                  ? 'text-orange-600 border-orange-200 hover:bg-orange-50 hover:border-orange-300 dark:text-orange-400 dark:border-orange-800 dark:hover:bg-orange-900/20 focus:ring-2 focus:ring-orange-500/20 focus:outline-none active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed'
                                  : 'bg-green-600 hover:bg-green-700 text-white focus:ring-2 focus:ring-green-500/20 focus:outline-none active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed'
                                }
                              >
                                {partner.status === 'active' ? 'Suspend' : 'Activate'}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredPartners.length === 0 && (
                  <div className="text-center py-12">
                    <Building2 className="w-12 h-12 text-[var(--text-tertiary)] mx-auto mb-4" />
                    <p className="text-[var(--text-secondary)]">No partners found</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Teams Tab */}
        {activeTab === 'teams' && (
          <Card variant="glass">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-[var(--text-primary)]">Teams</CardTitle>
                  <CardDescription>View all teams across partners</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Search */}
              <div className="mb-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-tertiary)]" />
                  <input
                    type="text"
                    placeholder="Search teams..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
                  />
                </div>
              </div>

              {/* Teams Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {teams
                  .filter(team => 
                    team.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    team.partner_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    team.domain?.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((team) => (
                  <Link 
                    key={team.id} 
                    className="p-4 bg-[var(--surface-subtle)] rounded-xl border border-[var(--border)] hover:border-[var(--primary)]/30 hover:shadow-md transition-all cursor-pointer"
                    href={`/moil-admin/teams/${team.id}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[var(--info)]/10 flex items-center justify-center text-[var(--info)] font-bold">
                          {team.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-[var(--text-primary)]">{team.name}</p>
                          <p className="text-xs text-[var(--text-tertiary)]">{team.domain}</p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Partner & License Info */}
                    <div className="flex items-center gap-4 mb-3">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                        <span className="text-xs text-[var(--text-secondary)]">{team.partner_name}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Key className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                        <span className="text-xs text-[var(--text-secondary)]">{team.license_count || 0} / {team.purchased_license_count || 0} licenses</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
                      <span className="text-xs text-[var(--text-tertiary)]">
                        Created {new Date(team.created_at).toLocaleDateString()}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[var(--primary)]"
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </Button>
                    </div>
                  </Link>
                ))}
              </div>
              {teams.length === 0 && (
                <div className="text-center py-12">
                  <Users2 className="w-12 h-12 text-[var(--text-tertiary)] mx-auto mb-4" />
                  <p className="text-[var(--text-secondary)]">No teams found</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Licenses Tab */}
        {activeTab === 'licenses' && (
          <Card variant="glass">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-[var(--text-primary)]">Licenses</CardTitle>
                  <CardDescription>All licenses created from your Moil admin account</CardDescription>
                </div>
                <Button onClick={() => setShowAddLicenseModal(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add License
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {licensesLoading ? (
                <div className="text-center py-12">
                  <Spinner size="lg" variant="primary" className="mx-auto" />
                  <p className="mt-4 text-[var(--text-secondary)]">Loading licenses...</p>
                </div>
              ) : (
                <>
                  {/* Licenses Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[var(--border)]">
                          <th className="text-left py-3 px-4 text-sm font-semibold text-[var(--text-secondary)]">Email</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-[var(--text-secondary)]">Business Name</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-[var(--text-secondary)]">Status</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-[var(--text-secondary)]">Created</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-[var(--text-secondary)]">Activated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {licenses.map((license) => (
                          <tr key={license.id} className="border-b border-[var(--border)] hover:bg-[var(--surface-subtle)] transition-colors">
                            <td className="py-4 px-4">
                              <p className="font-medium text-[var(--text-primary)]">{license.email}</p>
                            </td>
                            <td className="py-4 px-4 text-[var(--text-secondary)]">
                              {license.business_name || '-'}
                            </td>
                            <td className="py-4 px-4">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                                license.is_activated 
                                  ? 'bg-[var(--accent)]/10 text-[var(--accent)]' 
                                  : 'bg-[var(--warning)]/10 text-[var(--warning)]'
                              }`}>
                                {license.is_activated ? (
                                  <>
                                    <CheckCircle className="w-3 h-3" />
                                    Activated
                                  </>
                                ) : (
                                  <>
                                    <Clock className="w-3 h-3" />
                                    Pending
                                  </>
                                )}
                              </span>
                            </td>
                            <td className="py-4 px-4 text-[var(--text-secondary)] text-sm">
                              {new Date(license.created_at).toLocaleDateString()}
                            </td>
                            <td className="py-4 px-4 text-[var(--text-secondary)] text-sm">
                              {license.activated_at ? new Date(license.activated_at).toLocaleDateString() : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {licenses.length === 0 && (
                      <div className="text-center py-12">
                        <Key className="w-12 h-12 text-[var(--text-tertiary)] mx-auto mb-4" />
                        <p className="text-[var(--text-secondary)] mb-2">No licenses found</p>
                        <p className="text-sm text-[var(--text-tertiary)]">Click "Add License" to create your first license</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add License Modal */}
      {showAddLicenseModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--surface)] rounded-2xl shadow-2xl max-w-md w-full border border-[var(--border)]">
            <div className="p-6 border-b border-[var(--border)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[var(--secondary)]/10 flex items-center justify-center">
                    <Key className="w-5 h-5 text-[var(--secondary)]" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-[var(--text-primary)]">Add License</h2>
                    <p className="text-sm text-[var(--text-secondary)]">Create a new license</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowAddLicenseModal(false);
                    setLicenseEmail('');
                  }}
                  className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleAddLicense} className="p-6 space-y-4">
              {/* Email Input */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                  Email Address *
                </label>
                <input
                  type="email"
                  value={licenseEmail}
                  onChange={(e) => setLicenseEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-4 py-2.5 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
                  disabled={addingLicense}
                  required
                />
                <p className="text-xs text-[var(--text-tertiary)] mt-2">
                  An activation email will be sent to this address
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowAddLicenseModal(false);
                    setLicenseEmail('');
                  }}
                  disabled={addingLicense}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={addingLicense || !licenseEmail.trim()}
                  loading={addingLicense}
                  className="flex-1"
                >
                  {addingLicense ? 'Adding...' : 'Add License'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        description={confirmModal.description}
        confirmText={confirmModal.confirmText}
        variant={confirmModal.variant}
        isLoading={updatingStatus !== null}
      />
    </div>
  );
}
