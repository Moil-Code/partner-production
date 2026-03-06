'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/toast/use-toast';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { X, UserPlus, Clock, Shield, Trash2, Edit2, Check, User, Users } from 'lucide-react';

interface TeamMember {
  id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  admin: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
  };
}

interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
}

interface Team {
  id: string;
  name: string;
  domain: string;
  owner_id: string;
}

interface TeamData {
  team: Team | null;
  userRole: string | null;
  isOwner: boolean;
  members: TeamMember[];
  pendingInvitations: PendingInvitation[];
  hasTeam: boolean;
}

interface TeamManagementProps {
  onClose: () => void;
}

export default function TeamManagement({ onClose }: TeamManagementProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  
  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [inviting, setInviting] = useState(false);
  
  // Edit team name state
  const [editingName, setEditingName] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [savingName, setSavingName] = useState(false);
  
  // Create team state
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [newTeamNameInput, setNewTeamNameInput] = useState('');

  useEffect(() => {
    fetchTeamData();
  }, []);

  const fetchTeamData = async () => {
    try {
      const response = await fetch('/api/team');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load team data');
      }

      setTeamData(data);
      if (data.team) {
        setNewTeamName(data.team.name);
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || 'Failed to load team data',
        type: "error"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);

    try {
      const response = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send invitation');
      }

      toast({
        title: "Invitation Sent",
        description: `Invitation sent to ${inviteEmail}`,
        type: "success"
      });
      setInviteEmail('');
      fetchTeamData();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || 'Failed to send invitation',
        type: "error"
      });
    } finally {
      setInviting(false);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    if (!confirm('Are you sure you want to cancel this invitation?')) return;

    try {
      const response = await fetch('/api/team/invite', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitationId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to cancel invitation');
      }

      toast({
        title: "Success",
        description: "Invitation cancelled",
        type: "success"
      });
      fetchTeamData();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || 'Failed to cancel invitation',
        type: "error"
      });
    }
  };

  const handleUpdateRole = async (memberId: string, newRole: string) => {
    try {
      const response = await fetch('/api/team/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, role: newRole }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update role');
      }

      toast({
        title: "Success",
        description: "Role updated successfully",
        type: "success"
      });
      fetchTeamData();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || 'Failed to update role',
        type: "error"
      });
    }
  };

  const handleRemoveMember = async (memberId: string, memberEmail: string) => {
    if (!confirm(`Are you sure you want to remove ${memberEmail} from the team?`)) return;

    try {
      const response = await fetch('/api/team/members', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove member');
      }

      toast({
        title: "Success",
        description: "Member removed successfully",
        type: "success"
      });
      fetchTeamData();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || 'Failed to remove member',
        type: "error"
      });
    }
  };

  const handleSaveTeamName = async () => {
    if (!newTeamName.trim()) return;
    
    setSavingName(true);

    try {
      const response = await fetch('/api/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTeamName }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update team name');
      }

      toast({
        title: "Success",
        description: "Team name updated",
        type: "success"
      });
      setEditingName(false);
      fetchTeamData();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || 'Failed to update team name',
        type: "error"
      });
    } finally {
      setSavingName(false);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingTeam(true);

    try {
      const response = await fetch('/api/team/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTeamNameInput || undefined }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create team');
      }

      toast({
        title: "Success",
        description: "Team created successfully!",
        type: "success"
      });
      setNewTeamNameInput('');
      fetchTeamData();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || 'Failed to create team',
        type: "error"
      });
    } finally {
      setCreatingTeam(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'owner':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'admin':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
      <Card variant="glass" className="w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border-[var(--glass-border)] bg-[var(--surface)]">
        {/* Header */}
        <CardHeader className="flex flex-row items-center justify-between border-b border-[var(--border)] py-4 sticky top-0 bg-[var(--surface)]/95 backdrop-blur z-10">
          <div className="flex items-center gap-3">
             <div className="p-2.5 bg-[var(--primary)]/10 rounded-xl">
               <Users className="w-6 h-6 text-[var(--primary)]" />
             </div>
             <div>
               <CardTitle className="text-xl">Team Management</CardTitle>
               <CardDescription>Manage your team members and invitations</CardDescription>
             </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-[var(--surface-subtle)]">
            <X className="w-5 h-5" />
          </Button>
        </CardHeader>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 bg-[var(--background)]">
          {loading ? (
            <div className="text-center py-20 flex flex-col items-center">
              <Spinner size="lg" variant="primary" />
              <p className="mt-4 text-[var(--text-secondary)] animate-pulse font-medium">Loading team data...</p>
            </div>
          ) : (
            <>
              {/* No Team - Create Team Option */}
              {teamData && !teamData.hasTeam && (
                <div className="text-center py-12 max-w-lg mx-auto">
                  <div className="w-24 h-24 bg-[var(--primary)]/5 rounded-full flex items-center justify-center mx-auto mb-6 ring-4 ring-[var(--primary)]/10">
                    <UserPlus className="w-10 h-10 text-[var(--primary)]" />
                  </div>
                  <h3 className="text-2xl font-bold text-[var(--text-primary)] mb-3">You're not part of a team yet</h3>
                  <p className="text-[var(--text-secondary)] mb-8 leading-relaxed">
                    Create your own team to invite collaborators, or wait for an invitation from an existing team.
                  </p>
                  
                  <Card className="p-6 border-[var(--border)] shadow-sm">
                    <form onSubmit={handleCreateTeam} className="space-y-4">
                      <input
                        type="text"
                        value={newTeamNameInput}
                        onChange={(e) => setNewTeamNameInput(e.target.value)}
                        placeholder="Team name (optional)"
                        className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all"
                      />
                      <Button
                        type="submit"
                        disabled={creatingTeam}
                        className="w-full h-12 text-base shadow-lg shadow-[var(--primary)]/20"
                        loading={creatingTeam}
                      >
                        {creatingTeam ? 'Creating Team...' : 'Create My Team'}
                      </Button>
                    </form>
                  </Card>
                  
                  <p className="text-[var(--text-tertiary)] text-xs mt-6 bg-[var(--surface-subtle)] py-2 px-4 rounded-lg inline-block border border-[var(--border)]">
                    You can manage your licenses without a team, but creating one allows you to invite collaborators.
                  </p>
                </div>
              )}

              {teamData && teamData.hasTeam && teamData.team && (
                <div className="space-y-8">
                  {/* Team Info Card */}
                  <div className="bg-gradient-to-br from-[var(--primary)] to-[var(--primary-800)] rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-[var(--secondary)]/20 rounded-full translate-y-1/2 -translate-x-1/4 blur-3xl"></div>
                    
                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="flex-1">
                        {editingName ? (
                          <div className="flex items-center gap-3">
                            <input
                              type="text"
                              value={newTeamName}
                              onChange={(e) => setNewTeamName(e.target.value)}
                              className="px-4 py-2 text-[var(--text-primary)] bg-white rounded-lg focus:outline-none ring-2 ring-white/50 text-xl font-bold w-full md:w-auto shadow-lg"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={handleSaveTeamName}
                                disabled={savingName}
                                className="p-2 bg-white text-[var(--primary)] rounded-lg font-semibold hover:bg-gray-100 transition-colors shadow-md"
                              >
                                {savingName ? <Spinner size="sm" /> : <Check className="w-5 h-5" />}
                              </button>
                              <button
                                onClick={() => {
                                  setEditingName(false);
                                  setNewTeamName(teamData.team!.name);
                                }}
                                className="p-2 bg-white/20 text-white rounded-lg font-semibold hover:bg-white/30 transition-colors backdrop-blur-sm"
                              >
                                <X className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 group">
                            <h3 className="text-3xl font-bold tracking-tight">{teamData.team.name}</h3>
                            {teamData.isOwner && (
                              <button
                                onClick={() => setEditingName(true)}
                                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all opacity-0 group-hover:opacity-100 backdrop-blur-sm"
                                title="Edit team name"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                        <p className="text-white/70 mt-2 flex items-center gap-2 text-sm font-medium">
                          <span className="opacity-60">Domain:</span> 
                          <span className="bg-white/10 px-2 py-0.5 rounded text-white/90">@{teamData.team.domain}</span>
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-6 bg-black/20 rounded-2xl p-4 backdrop-blur-md border border-white/10">
                        <div className="text-center px-2">
                          <div className="text-3xl font-bold">{teamData.members.length}</div>
                          <div className="text-white/60 text-[10px] uppercase tracking-wider font-bold mt-1">Members</div>
                        </div>
                        <div className="h-10 w-px bg-white/20"></div>
                        <div className="text-center px-2">
                          <div className="text-3xl font-bold">{teamData.pendingInvitations.length}</div>
                          <div className="text-white/60 text-[10px] uppercase tracking-wider font-bold mt-1">Pending</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Invite Member */}
                  {(teamData.isOwner || teamData.userRole === 'admin') && (
                    <Card className="border-[var(--border)] overflow-hidden">
                      <div className="bg-[var(--surface-subtle)]/50 p-6 border-b border-[var(--border)]">
                        <h4 className="font-semibold text-[var(--text-primary)] flex items-center gap-2 text-lg">
                          <div className="p-1.5 bg-[var(--primary)]/10 rounded-md">
                             <UserPlus className="w-5 h-5 text-[var(--primary)]" />
                          </div>
                          Invite Team Member
                        </h4>
                      </div>
                      <CardContent className="p-6">
                        <form onSubmit={handleInvite} className="flex flex-col md:flex-row gap-4">
                          <div className="flex-1 relative">
                            <input
                              type="email"
                              value={inviteEmail}
                              onChange={(e) => setInviteEmail(e.target.value)}
                              placeholder={`colleague@${teamData.team!.domain}`}
                              className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] focus:outline-none focus:ring-4 focus:ring-[var(--primary)]/10 focus:border-[var(--primary)] transition-all"
                              required
                            />
                          </div>
                          <select
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
                            className="px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] focus:outline-none focus:ring-4 focus:ring-[var(--primary)]/10 focus:border-[var(--primary)] transition-all min-w-[140px]"
                          >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                          </select>
                          <Button
                            type="submit"
                            disabled={inviting || !inviteEmail}
                            className="h-auto py-3 px-6 whitespace-nowrap shadow-md hover:shadow-lg transition-all"
                            loading={inviting}
                          >
                            {inviting ? 'Sending...' : 'Send Invite'}
                          </Button>
                        </form>
                        <p className="text-[var(--text-tertiary)] text-xs mt-4 flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                          Only emails ending in <span className="font-medium text-[var(--text-secondary)]">@{teamData.team!.domain}</span> can be invited for security.
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  {/* Pending Invitations */}
                  {teamData.pendingInvitations.length > 0 && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <h4 className="font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-amber-500" />
                        Pending Invitations <span className="text-[var(--text-tertiary)] text-sm font-normal ml-1">({teamData.pendingInvitations.length})</span>
                      </h4>
                      <div className="grid gap-3">
                        {teamData.pendingInvitations.map((invitation) => (
                          <div key={invitation.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-amber-50/50 border border-amber-100 rounded-xl gap-4 hover:border-amber-200 transition-colors">
                            <div className="flex items-start gap-4">
                              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0 border border-amber-200">
                                <span className="text-amber-700 font-bold text-sm">
                                  {invitation.email[0].toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <p className="font-medium text-gray-900">{invitation.email}</p>
                                <div className="flex flex-wrap gap-2 mt-1">
                                  <span className="text-xs px-2.5 py-0.5 bg-white border border-amber-200 text-amber-700 rounded-full font-medium capitalize shadow-sm">
                                    {invitation.role}
                                  </span>
                                  <span className="text-xs text-gray-500 flex items-center gap-1 bg-white/50 px-2 py-0.5 rounded-full">
                                    Expires {formatDate(invitation.expires_at)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            {(teamData.isOwner || teamData.userRole === 'admin') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCancelInvitation(invitation.id)}
                                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                              >
                                Cancel
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Team Members */}
                  <div>
                    <h4 className="font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                      <Users className="w-5 h-5 text-[var(--primary)]" />
                      Team Members <span className="text-[var(--text-tertiary)] text-sm font-normal ml-1">({teamData.members.length})</span>
                    </h4>
                    <div className="grid gap-3">
                      {teamData.members.map((member) => {
                        const firstName = member.admin?.first_name || '';
                        const lastName = member.admin?.last_name || '';
                        const email = member.admin?.email || 'Unknown';
                        const initials = firstName && lastName ? `${firstName[0]}${lastName[0]}` : email[0].toUpperCase();
                        const fullName = firstName && lastName ? `${firstName} ${lastName}` : email.split('@')[0];
                        
                        return (
                        <div key={member.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--primary)]/30 hover:shadow-md transition-all duration-200 gap-4 group">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-gradient-to-br from-[var(--primary)] to-[var(--primary-600)] rounded-full flex items-center justify-center text-white font-semibold shadow-sm shrink-0 border border-[var(--primary)]/20">
                              {initials}
                            </div>
                            <div>
                              <p className="font-medium text-[var(--text-primary)] flex items-center gap-2">
                                {fullName}
                                {member.role === 'owner' && <span className="text-[10px] bg-[var(--primary)]/10 text-[var(--primary)] px-1.5 py-0.5 rounded border border-[var(--primary)]/20 font-bold uppercase tracking-wider">Owner</span>}
                              </p>
                              <p className="text-sm text-[var(--text-secondary)]">{email}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                            {member.role !== 'owner' && <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize border ${getRoleBadgeClass(member.role)}`}>
                              {member.role}
                            </span>}
                            
                            {teamData.isOwner && member.role !== 'owner' && (
                              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <select
                                  value={member.role}
                                  onChange={(e) => handleUpdateRole(member.id, e.target.value)}
                                  className="px-2 py-1.5 border border-[var(--border)] rounded-lg text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 bg-[var(--surface-subtle)] text-[var(--text-primary)] cursor-pointer hover:bg-[var(--surface)] transition-colors"
                                >
                                  <option value="member">Member</option>
                                  <option value="admin">Admin</option>
                                </select>
                                <button
                                  onClick={() => handleRemoveMember(member.id, email)}
                                  className="p-2 text-[var(--text-tertiary)] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Remove member"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
