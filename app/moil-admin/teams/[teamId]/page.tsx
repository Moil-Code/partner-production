'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast/use-toast';
import Logo from '@/components/ui/Logo';
import { useAuthStore, useTeamStore } from '@/lib/stores';
import { 
  ArrowLeft,
  Building2,
  Users,
  Key,
  Mail,
  CheckCircle,
  Clock,
  Copy,
  Link,
  Eye,
  Shield,
  Activity,
  Calendar,
  User,
  Edit2,
  Plus,
  Minus,
  X
} from 'lucide-react';

interface Team {
  id: string;
  name: string;
  domain: string;
  partner_id: string;
  owner_id: string;
  purchased_license_count: number;
  created_at: string;
}

interface Partner {
  id: string;
  name: string;
  domain: string;
  primary_color: string;
  logo_url?: string;
}

interface TeamMember {
  id: string;
  admin_id: string;
  role: string;
  joined_at: string;
  admin: {
    email: string;
    first_name: string;
    last_name: string;
  };
}

interface License {
  id: string;
  email: string;
  business_name: string;
  is_activated: boolean;
  activated_at: string | null;
  created_at: string;
}

interface TeamInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
  token: string;
  expires_at: string;
  created_at: string;
}

interface Stats {
  totalLicenses: number;
  activatedLicenses: number;
  pendingLicenses: number;
  teamMembers: number;
  pendingInvitations: number;
}

export default function TeamViewPage() {
  const router = useRouter();
  const params = useParams();
  const teamId = params.teamId as string;
  const { toast } = useToast();
  

  // Zustand stores
  const { isLoading: authLoading, isMoilAdmin, fetchAuth } = useAuthStore();
  const { teamDetails, detailsLoading, fetchTeamDetail, invalidateTeam } = useTeamStore();

  // Get cached team detail
  const teamDetail = teamDetails[teamId];
  const dataLoading = detailsLoading[teamId] || false;
  const team = teamDetail?.team || null;
  const partner = teamDetail?.partner || null;
  const rawMembers = teamDetail?.members || [];
  const licenses = teamDetail?.licenses || [];
  const invitations = teamDetail?.invitations || [];

  // Format members data
  const members = useMemo(() => {
    return rawMembers.map((m: any) => ({
      id: m.id,
      admin_id: m.admin_id,
      role: m.role,
      joined_at: m.joined_at,
      admin: {
        email: m.admin?.email || '',
        first_name: m.admin?.first_name || '',
        last_name: m.admin?.last_name || '',
      }
    }));
  }, [rawMembers]);

  // Calculate stats from cached data
  const stats = useMemo(() => {
    const totalLicenses = licenses.length;
    const activatedLicenses = licenses.filter((l: any) => l.is_activated).length;
    return {
      totalLicenses,
      activatedLicenses,
      pendingLicenses: totalLicenses - activatedLicenses,
      teamMembers: members.length,
      pendingInvitations: invitations.length,
    };
  }, [licenses, members, invitations]);

  // Fetch auth on mount
  useEffect(() => {
    fetchAuth();
  }, [fetchAuth]);

  // Fetch team detail when authorized
  useEffect(() => {
    if (isMoilAdmin && teamId) {
      fetchTeamDetail(teamId);
    }
  }, [isMoilAdmin, teamId, fetchTeamDetail]);

  // Redirect if not authorized
  useEffect(() => {
    if (!authLoading && !isMoilAdmin) {
      router.push('/admin/dashboard');
    }
  }, [authLoading, isMoilAdmin, router]);

  // Redirect if team not found after loading
  useEffect(() => {
    if (isMoilAdmin && !dataLoading && !team && teamDetail !== undefined) {
      toast({
        title: 'Error',
        description: 'Team not found',
        type: 'error',
      });
      router.push('/moil-admin/dashboard');
    }
  }, [isMoilAdmin, dataLoading, team, teamDetail, router, toast]);

  // State for adding licenses
  const [showEditLicenseModal, setShowEditLicenseModal] = React.useState(false);
  const [licensesToAdd, setLicensesToAdd] = React.useState(0);
  const [updatingLicenseCount, setUpdatingLicenseCount] = React.useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: 'Link copied to clipboard',
      type: 'success',
    });
  };

  const getInvitationLink = (token: string) => {
    return `${window.location.origin}/invite/${token}`;
  };

  const handleUpdateLicenseCount = async () => {
    if (licensesToAdd <= 0) {
      toast({
        title: 'Invalid Count',
        description: 'Please enter a positive number of licenses to add',
        type: 'error',
      });
      return;
    }

    if (!team) return;

    const newTotalCount = (team.purchased_license_count || 0) + licensesToAdd;

    setUpdatingLicenseCount(true);
    try {
      const response = await fetch(`/api/teams/${teamId}/update-license-count`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchasedLicenseCount: newTotalCount }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to update license count');
      }

      toast({
        title: 'Success',
        description: `Added ${licensesToAdd} license${licensesToAdd !== 1 ? 's' : ''}. New total: ${newTotalCount}`,
        type: 'success',
      });

      setShowEditLicenseModal(false);
      setLicensesToAdd(0);
      // Refresh team data
      invalidateTeam(teamId);
      fetchTeamDetail(teamId);
    } catch (error) {
      console.error('Error updating license count:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update license count',
        type: 'error',
      });
    } finally {
      setUpdatingLicenseCount(false);
    }
  };

  if (authLoading || !isMoilAdmin || dataLoading || !team) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" variant="primary" className="mx-auto" />
          <p className="mt-4 text-[var(--text-secondary)]">Loading team data...</p>
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
      <header className="bg-[var(--surface)] border-b border-[var(--border)] sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Logo size="sm" showText={false} />
              <div>
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[var(--text-tertiary)]" />
                  <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Read-Only View</span>
                </div>
                <h1 className="text-xl font-bold text-[var(--text-primary)]">{team.name}</h1>
              </div>
            </div>
            <Button variant="ghost" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        {/* Partner Info Banner */}
        {partner && (
          <div className="mb-6 p-4 bg-[var(--surface)] rounded-xl border border-[var(--border)] flex items-center gap-4">
            <div 
              className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-lg"
              style={{ backgroundColor: partner.primary_color || 'var(--primary)' }}
            >
              {partner.name.charAt(0)}
            </div>
            <div>
              <p className="text-sm text-[var(--text-tertiary)]">Partner Organization</p>
              <p className="font-semibold text-[var(--text-primary)]">{partner.name}</p>
              <p className="text-sm text-[var(--text-secondary)] font-mono">{partner.domain}</p>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card variant="glass">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                  <Key className="w-5 h-5 text-[var(--primary)]" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{stats.totalLicenses}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">Total Licenses</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card variant="glass">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-[var(--accent)]" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--accent)]">{stats.activatedLicenses}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">Activated</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card variant="glass">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[var(--warning)]/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-[var(--warning)]" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--warning)]">{stats.pendingLicenses}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card variant="glass">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[var(--info)]/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-[var(--info)]" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--info)]">{stats.teamMembers}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">Team Members</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Team Members */}
          <Card variant="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[var(--text-primary)]">
                <Users className="w-5 h-5" />
                Team Members
              </CardTitle>
              <CardDescription>{members.length} member{members.length !== 1 ? 's' : ''}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {members.map((member) => (
                  <div key={member.id} className="flex items-center gap-3 p-3 bg-[var(--surface-subtle)] rounded-lg">
                    <div className="w-10 h-10 rounded-full bg-[var(--primary)]/10 flex items-center justify-center text-[var(--primary)] font-bold">
                      {member.admin.first_name?.charAt(0) || member.admin.email.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[var(--text-primary)] truncate">
                        {member.admin.first_name && member.admin.last_name 
                          ? `${member.admin.first_name} ${member.admin.last_name}`
                          : member.admin.email}
                      </p>
                      <p className="text-xs text-[var(--text-tertiary)] truncate">{member.admin.email}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      member.role === 'owner' 
                        ? 'bg-[var(--primary)]/10 text-[var(--primary)]' 
                        : 'bg-[var(--surface-hover)] text-[var(--text-secondary)]'
                    }`}>
                      {member.role}
                    </span>
                  </div>
                ))}
                {members.length === 0 && (
                  <p className="text-center text-[var(--text-tertiary)] py-4">No team members</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Pending Invitations */}
          <Card variant="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[var(--text-primary)]">
                <Mail className="w-5 h-5" />
                Pending Invitations
              </CardTitle>
              <CardDescription>{invitations.length} pending</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {invitations.map((invitation) => (
                  <div key={invitation.id} className="p-3 bg-[var(--surface-subtle)] rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-[var(--text-primary)] text-sm truncate">{invitation.email}</p>
                      <span className="px-2 py-0.5 bg-[var(--warning)]/10 text-[var(--warning)] rounded-full text-xs">
                        {invitation.role}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={getInvitationLink(invitation.token)}
                        readOnly
                        className="flex-1 px-2 py-1 bg-[var(--surface)] border border-[var(--border)] rounded text-xs font-mono text-[var(--text-tertiary)] truncate"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(getInvitationLink(invitation.token))}
                        className="shrink-0"
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)] mt-2">
                      Expires: {new Date(invitation.expires_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
                {invitations.length === 0 && (
                  <p className="text-center text-[var(--text-tertiary)] py-4">No pending invitations</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Team Info */}
          <Card variant="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[var(--text-primary)]">
                <Activity className="w-5 h-5" />
                Team Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-[var(--surface-subtle)] rounded-lg">
                  <Building2 className="w-5 h-5 text-[var(--text-tertiary)]" />
                  <div>
                    <p className="text-xs text-[var(--text-tertiary)]">Team Name</p>
                    <p className="font-medium text-[var(--text-primary)]">{team.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-[var(--surface-subtle)] rounded-lg">
                  <Mail className="w-5 h-5 text-[var(--text-tertiary)]" />
                  <div>
                    <p className="text-xs text-[var(--text-tertiary)]">Domain</p>
                    <p className="font-medium text-[var(--text-primary)] font-mono">{team.domain}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-[var(--surface-subtle)] rounded-lg">
                  <div className="flex items-center gap-3">
                    <Key className="w-5 h-5 text-[var(--text-tertiary)]" />
                    <div>
                      <p className="text-xs text-[var(--text-tertiary)]">Purchased Licenses</p>
                      <p className="font-medium text-[var(--text-primary)]">{team.purchased_license_count}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setLicensesToAdd(0);
                      setShowEditLicenseModal(true);
                    }}
                    className="text-[var(--primary)] hover:bg-[var(--primary)]/10"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-3 p-3 bg-[var(--surface-subtle)] rounded-lg">
                  <Calendar className="w-5 h-5 text-[var(--text-tertiary)]" />
                  <div>
                    <p className="text-xs text-[var(--text-tertiary)]">Created</p>
                    <p className="font-medium text-[var(--text-primary)]">
                      {new Date(team.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Licenses Table */}
        <Card variant="glass" className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[var(--text-primary)]">
              <Key className="w-5 h-5" />
              Licenses
            </CardTitle>
            <CardDescription>{licenses.length} license{licenses.length !== 1 ? 's' : ''} assigned</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-[var(--text-secondary)]">Email</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-[var(--text-secondary)]">Business</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-[var(--text-secondary)]">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-[var(--text-secondary)]">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {licenses.map((license) => (
                    <tr key={license.id} className="border-b border-[var(--border)] hover:bg-[var(--surface-subtle)]">
                      <td className="py-3 px-4">
                        <p className="text-[var(--text-primary)]">{license.email}</p>
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)]">
                        {license.business_name || '-'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
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
                      <td className="py-3 px-4 text-[var(--text-tertiary)] text-sm">
                        {new Date(license.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {licenses.length === 0 && (
                <div className="text-center py-8">
                  <Key className="w-12 h-12 text-[var(--text-tertiary)] mx-auto mb-3" />
                  <p className="text-[var(--text-secondary)]">No licenses assigned yet</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Purchased License Count Modal */}
      {showEditLicenseModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--surface)] rounded-2xl shadow-2xl max-w-md w-full border border-[var(--border)]">
            <div className="p-6 border-b border-[var(--border)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                    <Key className="w-5 h-5 text-[var(--primary)]" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-[var(--text-primary)]">Add Licenses</h2>
                    <p className="text-sm text-[var(--text-secondary)]">Add more licenses for {team.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowEditLicenseModal(false)}
                  className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                  Number of Licenses to Add
                </label>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLicensesToAdd(Math.max(0, licensesToAdd - 1))}
                    disabled={updatingLicenseCount || licensesToAdd <= 0}
                    className="w-10 h-10 p-0"
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <input
                    type="number"
                    min="0"
                    value={licensesToAdd}
                    onChange={(e) => setLicensesToAdd(Math.max(0, parseInt(e.target.value) || 0))}
                    className="flex-1 px-4 py-2.5 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] text-[var(--text-primary)] text-center text-lg font-semibold"
                    disabled={updatingLicenseCount}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLicensesToAdd(licensesToAdd + 1)}
                    disabled={updatingLicenseCount}
                    className="w-10 h-10 p-0"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] mt-2">
                  Current: {team.purchased_license_count || 0} • Used: {stats.totalLicenses} • New Total: {(team.purchased_license_count || 0) + licensesToAdd}
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEditLicenseModal(false)}
                  disabled={updatingLicenseCount}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleUpdateLicenseCount}
                  disabled={updatingLicenseCount || licensesToAdd <= 0}
                  loading={updatingLicenseCount}
                  className="flex-1"
                >
                  {updatingLicenseCount ? 'Adding...' : `Add ${licensesToAdd} License${licensesToAdd !== 1 ? 's' : ''}`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
