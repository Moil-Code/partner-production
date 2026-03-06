'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/toast/use-toast';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { X, Activity as ActivityIcon, Filter, ChevronLeft, ChevronRight, Inbox, Users, Clock } from 'lucide-react';

interface Activity {
  id: string;
  activity_type: string;
  description: string;
  metadata: Record<string, any>;
  created_at: string;
  admin: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
  } | null;
}

interface ActivityPanelProps {
  onClose: () => void;
}

const ACTIVITY_TYPE_CONFIG: Record<string, { icon: string; color: string; bgColor: string }> = {
  license_added: { icon: '➕', color: 'text-green-600', bgColor: 'bg-green-100' },
  license_removed: { icon: '🗑️', color: 'text-red-600', bgColor: 'bg-red-100' },
  license_activated: { icon: '✅', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  license_resend: { icon: '📧', color: 'text-purple-600', bgColor: 'bg-purple-100' },
  licenses_imported: { icon: '📥', color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
  licenses_purchased: { icon: '💳', color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
  member_invited: { icon: '📨', color: 'text-orange-600', bgColor: 'bg-orange-100' },
  member_joined: { icon: '👋', color: 'text-teal-600', bgColor: 'bg-teal-100' },
  member_removed: { icon: '👤', color: 'text-red-600', bgColor: 'bg-red-100' },
  member_role_changed: { icon: '🔄', color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
  team_settings_updated: { icon: '⚙️', color: 'text-gray-600', bgColor: 'bg-gray-100' },
};

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  license_added: 'License Added',
  license_removed: 'License Removed',
  license_activated: 'License Activated',
  license_resend: 'Email Resent',
  licenses_imported: 'Licenses Imported',
  licenses_purchased: 'Licenses Purchased',
  member_invited: 'Member Invited',
  member_joined: 'Member Joined',
  member_removed: 'Member Removed',
  member_role_changed: 'Role Changed',
  team_settings_updated: 'Settings Updated',
};

export default function ActivityPanel({ onClose }: ActivityPanelProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<string>('');
  const [offset, setOffset] = useState(0);
  const [hasTeam, setHasTeam] = useState(true);
  const limit = 20;

  useEffect(() => {
    fetchActivities();
  }, [filter, offset]);

  const fetchActivities = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });
      if (filter) {
        params.append('type', filter);
      }

      const response = await fetch(`/api/team/activity?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load activities');
      }

      setActivities(data.activities);
      setTotal(data.total);
      setHasTeam(data.hasTeam !== false);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || 'Failed to load activities',
        type: "error"
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  const getActivityConfig = (type: string) => {
    return ACTIVITY_TYPE_CONFIG[type] || { icon: '📋', color: 'text-gray-600', bgColor: 'bg-gray-100' };
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
      <Card variant="glass" className="w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border-[var(--glass-border)] bg-[var(--surface)]">
        {/* Header */}
        <CardHeader className="flex flex-row items-center justify-between border-b border-[var(--border)] py-4 sticky top-0 bg-[var(--surface)]/95 backdrop-blur z-10">
          <div className="flex items-center gap-3">
             <div className="p-2.5 bg-[var(--primary)]/10 rounded-xl">
               <ActivityIcon className="w-6 h-6 text-[var(--primary)]" />
             </div>
             <div>
               <CardTitle className="text-xl">Activity Log</CardTitle>
               <CardDescription>Track all actions taken by team members</CardDescription>
             </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-[var(--surface-subtle)]">
            <X className="w-5 h-5" />
          </Button>
        </CardHeader>

        {/* Filter */}
        <div className="px-6 md:px-8 py-4 border-b border-[var(--border)] bg-[var(--surface-subtle)]/50 flex items-center gap-3">
          <Filter className="w-4 h-4 text-[var(--text-tertiary)]" />
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setOffset(0);
            }}
            className="px-4 py-2 border border-[var(--border)] rounded-lg focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 bg-[var(--surface)] text-sm w-full md:w-auto hover:border-[var(--primary)]/50 transition-colors cursor-pointer text-[var(--text-secondary)]"
          >
            <option value="">All Activities</option>
            <optgroup label="License Actions">
              <option value="license_added">License Added</option>
              <option value="license_removed">License Removed</option>
              <option value="license_activated">License Activated</option>
              <option value="license_resend">Email Resent</option>
              <option value="licenses_imported">Licenses Imported</option>
              <option value="licenses_purchased">Licenses Purchased</option>
            </optgroup>
            <optgroup label="Team Actions">
              <option value="member_invited">Member Invited</option>
              <option value="member_joined">Member Joined</option>
              <option value="member_removed">Member Removed</option>
              <option value="member_role_changed">Role Changed</option>
              <option value="team_settings_updated">Settings Updated</option>
            </optgroup>
          </select>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-[var(--background)]">
          {loading ? (
            <div className="text-center py-12 flex flex-col items-center">
              <Spinner size="lg" variant="primary" />
              <p className="mt-4 text-[var(--text-secondary)] animate-pulse font-medium">Loading activities...</p>
            </div>
          ) : !hasTeam ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-[var(--primary)]/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-[var(--primary)]/10">
                <Users className="w-8 h-8 text-[var(--primary)]" />
              </div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">No Team Activity</h3>
              <p className="text-[var(--text-secondary)] max-w-sm mx-auto">
                Activity logs are only available for team members. Create or join a team to start tracking activities.
              </p>
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-[var(--surface-subtle)] rounded-full flex items-center justify-center mx-auto mb-4 border border-[var(--border)]">
                <Inbox className="w-8 h-8 text-[var(--text-tertiary)]" />
              </div>
              <p className="text-[var(--text-secondary)]">No activities found</p>
              {filter && (
                <button
                  onClick={() => setFilter('')}
                  className="mt-2 text-[var(--primary)] hover:underline text-sm font-medium"
                >
                  Clear filter
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {activities.map((activity) => {
                const config = getActivityConfig(activity.activity_type);
                return (
                  <div key={activity.id} className="flex gap-4 p-4 bg-[var(--surface)] rounded-xl hover:shadow-md border border-[var(--border)] hover:border-[var(--primary)]/20 transition-all duration-200">
                    <div className={`w-10 h-10 ${config.bgColor} rounded-full flex items-center justify-center flex-shrink-0 shadow-sm border border-black/5`}>
                      <span className="text-lg">{config.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className={`text-xs font-semibold ${config.color} uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/80 border border-black/5`}>
                            {ACTIVITY_TYPE_LABELS[activity.activity_type] || activity.activity_type}
                          </span>
                          <p className="text-[var(--text-primary)] mt-1.5 leading-snug">{activity.description}</p>
                        </div>
                        <span className="text-[var(--text-tertiary)] text-xs whitespace-nowrap flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(activity.created_at)}
                        </span>
                      </div>
                      {activity.admin && (
                        <div className="flex items-center gap-1.5 mt-2 text-xs text-[var(--text-secondary)]">
                          <div className="w-4 h-4 rounded-full bg-[var(--surface-subtle)] flex items-center justify-center text-[10px] font-medium text-[var(--text-secondary)] border border-[var(--border)]">
                            {activity.admin.first_name?.[0] || activity.admin.email[0].toUpperCase()}
                          </div>
                          <span>
                            by <span className="font-medium text-[var(--text-primary)]">{activity.admin.first_name} {activity.admin.last_name}</span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        {total > limit && (
          <div className="border-t border-[var(--border)] px-6 py-4 md:px-8 flex items-center justify-between bg-[var(--surface-subtle)]/50">
            <p className="text-[var(--text-secondary)] text-sm font-medium">
              Showing {offset + 1}-{Math.min(offset + limit, total)} of {total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="h-9"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset(offset + limit)}
                disabled={currentPage >= totalPages}
                className="h-9"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

