import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface Statistics {
  total: number;
  activated: number;
  pending: number;
}

interface LicenseStats {
  purchased_license_count: number;
  active_purchased_license_count: number;
  available_licenses: number;
}

interface LicenseOverviewProps {
  stats: Statistics;
  licenseStats: LicenseStats;
  onAddMember?: () => void;
  onViewReports?: () => void;
}

export function LicenseOverview({ stats, licenseStats, onAddMember, onViewReports }: LicenseOverviewProps) {
  const utilizationRate = stats.total > 0 ? Math.round((stats.activated / stats.total) * 100) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Main Stats Card */}
      <Card variant="glass" className="md:col-span-2 overflow-hidden relative border-[var(--border)] shadow-sm">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--primary)]/5 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-[var(--secondary)]/5 rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2 pointer-events-none"></div>
        
        <CardContent className="relative z-10 p-8 flex flex-col justify-between h-full">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h2 className="text-2xl font-bold mb-2 text-[var(--text-primary)]">License Overview</h2>
              <p className="text-[var(--text-secondary)] text-sm">Manage and track your partner licenses</p>
            </div>
            <div className="bg-[var(--surface-subtle)] border border-[var(--border)] px-5 py-3 rounded-2xl">
              <span className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider font-semibold block mb-1">Utilization</span>
              <div className="text-2xl font-bold text-[var(--primary)]">{utilizationRate}%</div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-auto mb-8">
            <div className="bg-[var(--surface-subtle)] rounded-xl p-4 border border-[var(--border-light)]">
              <div className="text-[var(--text-tertiary)] text-xs font-medium uppercase tracking-wide mb-2">Purchased</div>
              <div className="text-2xl font-bold text-[var(--text-primary)]">{licenseStats.purchased_license_count}</div>
            </div>
            <div className="bg-[var(--surface-subtle)] rounded-xl p-4 border border-[var(--border-light)]">
              <div className="text-[var(--text-tertiary)] text-xs font-medium uppercase tracking-wide mb-2">Available</div>
              <div className="text-2xl font-bold text-[var(--secondary)]">{licenseStats.available_licenses}</div>
            </div>
            <div className="bg-[var(--surface-subtle)] rounded-xl p-4 border border-[var(--border-light)]">
              <div className="text-[var(--text-tertiary)] text-xs font-medium uppercase tracking-wide mb-2">Activated</div>
              <div className="text-2xl font-bold text-[var(--accent)]">{stats.activated}</div>
            </div>
            <div className="bg-[var(--surface-subtle)] rounded-xl p-4 border border-[var(--border-light)]">
              <div className="text-[var(--text-tertiary)] text-xs font-medium uppercase tracking-wide mb-2">Pending</div>
              <div className="text-2xl font-bold text-[var(--warning)]">{stats.pending}</div>
            </div>
          </div>
          
          <div>
            <div className="flex justify-between text-xs text-[var(--text-tertiary)] mb-2">
              <span>Usage Distribution</span>
              <span>{stats.activated} / {stats.total} Active</span>
            </div>
            <div className="h-2 bg-[var(--surface-subtle)] rounded-full overflow-hidden">
              <div 
                className="h-full bg-[var(--primary)] rounded-full transition-all duration-1000 ease-out" 
                style={{ width: `${utilizationRate}%` }}
              ></div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card variant="glass" className="flex flex-col justify-center p-6 border-[var(--border)] shadow-sm">
        <div className="space-y-6">
          <div>
            <h3 className="text-[var(--text-primary)] font-semibold text-lg">Quick Actions</h3>
            <p className="text-[var(--text-secondary)] text-sm mt-1">Common tasks for your team.</p>
          </div>
          
          <div className="space-y-3">
             <button 
               onClick={onAddMember}
               className="w-full flex items-center justify-between p-4 rounded-xl bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] border border-[var(--border-light)] transition-all cursor-pointer group"
             >
                <span className="text-sm font-medium text-[var(--text-secondary)] group-hover:text-[var(--primary)] transition-colors">Add New Member</span>
                <span className="w-8 h-8 rounded-full bg-[var(--surface)] flex items-center justify-center text-[var(--primary)] shadow-sm group-hover:scale-110 transition-transform">+</span>
             </button>
             <button 
               onClick={onViewReports}
               className="w-full flex items-center justify-between p-4 rounded-xl bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] border border-[var(--border-light)] transition-all cursor-pointer group"
             >
                <span className="text-sm font-medium text-[var(--text-secondary)] group-hover:text-[var(--primary)] transition-colors">View Activity</span>
                <span className="w-8 h-8 rounded-full bg-[var(--surface)] flex items-center justify-center text-[var(--primary)] shadow-sm group-hover:scale-110 transition-transform">→</span>
             </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
