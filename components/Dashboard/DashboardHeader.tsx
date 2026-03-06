'use client';

import React from 'react';
import Link from 'next/link';
import Logo from '@/components/ui/Logo';
import { Activity, Users, LogOut, LayoutDashboard, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';

interface DashboardHeaderProps {
  onShowActivity: () => void;
  onShowTeam: () => void;
  onLogout: () => void;
  partnerName?: string;
  partnerLogo?: string;
  partnerLogoInitial?: string;
  partnerPrimaryColor?: string;
}

export function DashboardHeader({ onShowActivity, onShowTeam, onLogout, partnerName, partnerLogo, partnerLogoInitial, partnerPrimaryColor }: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-40 w-full bg-[var(--surface)]/80 backdrop-blur-xl border-b border-[var(--border)] mb-8">
      <div className="layout-container h-20 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-4">
            {partnerLogo ? (
              <img src={partnerLogo} alt={partnerName || 'Partner Logo'} className="h-10 md:h-12 object-contain" />
            ) : partnerLogoInitial ? (
              <div 
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-sm"
                style={{ backgroundColor: partnerPrimaryColor || 'var(--primary)' }}
              >
                {partnerLogoInitial}
              </div>
            ) : (
              <img src='https://res.cloudinary.com/drlcisipo/image/upload/v1705704261/Website%20images/logo_gox0fw.png' alt="Moil Logo" className="w-12 h-6 md:w-16 md:h-8" />
            )}
            {partnerName && (
              <div>
                <span className="hidden md:block font-bold text-lg text-[var(--text-primary)] leading-tight">{partnerName}</span>
                <span className="hidden md:block text-xs text-[var(--text-tertiary)] font-medium">Partner Portal</span>
              </div>
            )}
          </div>

          <div className="hidden md:block h-8 w-[1px] bg-[var(--border)]" />

          <nav className="hidden md:flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-[var(--text-secondary)] font-medium hover:text-[var(--primary)] hover:bg-[var(--primary)]/5">
              <LayoutDashboard className="w-4 h-4 mr-2" />
              Overview
            </Button>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle variant="dropdown" className="hidden md:block w-36" />

          <div className="hidden md:flex items-center gap-2 pl-2 border-l border-[var(--border)]">
            <Button
              variant="ghost"
              size="sm"
              onClick={onShowActivity}
              className="text-[var(--text-secondary)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/5"
            >
              <Activity className="w-4 h-4 mr-2" />
              Activity
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={onShowTeam}
              className="text-[var(--text-secondary)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/5"
            >
              <Users className="w-4 h-4 mr-2" />
              Team
            </Button>

            <Link href="/admin/settings">
              <Button
                variant="ghost"
                size="sm"
                className="text-[var(--text-secondary)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/5"
              >
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
            </Link>
          </div>

          <div className="h-6 w-[1px] bg-[var(--border)] mx-1" />

          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            className="text-[var(--text-secondary)] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <LogOut className="w-4 h-4 md:mr-2" />
            <span className="hidden md:inline">Logout</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
