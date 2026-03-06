'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import TeamManagement from '@/components/TeamManagement';
import ActivityPanel from '@/components/ActivityPanel';
import { useToast } from '@/components/ui/toast/use-toast';
import { DashboardHeader } from '@/components/Dashboard/DashboardHeader';
import { LicenseOverview } from '@/components/Dashboard/LicenseOverview';
import { PurchaseCard } from '@/components/Dashboard/PurchaseCard';
import { AddLicenseForm } from '@/components/Dashboard/AddLicenseForm';
import { LicenseList } from '@/components/Dashboard/LicenseList';
import { PurchaseModal } from '@/components/Dashboard/PurchaseModal';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';

interface Partner {
  id: string;
  name: string;
  program_name: string;
  logo_url?: string;
  logo_initial?: string;
  primary_color: string;
  secondary_color?: string;
  font_family?: string;
}

interface License {
  id: string;
  email: string;
  isActivated: boolean;
  activatedAt: string | null;
  createdAt: string;
  businessName?: string;
  businessType?: string;
}

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

interface PaginationInfo {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

const DashboardPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [licenses, setLicenses] = useState<License[]>([]);
  const [statistics, setStatistics] = useState<Statistics>({ total: 0, activated: 0, pending: 0 });
  const [licenseStats, setLicenseStats] = useState<LicenseStats>({ purchased_license_count: 0, active_purchased_license_count: 0, available_licenses: 0 });
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [showTeamManagement, setShowTeamManagement] = useState(false);
  const [showActivityPanel, setShowActivityPanel] = useState(false);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    checkAuthAndFetchLicenses();
    fetchLicenseStats();
    handleUrlParams();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applyBrandIdentity = (partnerData: Partner) => {
    const root = document.documentElement;
    
    if (partnerData.primary_color) {
      root.style.setProperty('--primary', partnerData.primary_color);
      root.style.setProperty('--primary-hover', partnerData.primary_color);
    }
    
    if (partnerData.secondary_color) {
      root.style.setProperty('--secondary', partnerData.secondary_color);
    }
    
    if (partnerData.font_family) {
      root.style.setProperty('--font-family', partnerData.font_family);
      document.body.style.fontFamily = `${partnerData.font_family}, sans-serif`;
    }
  };

  const handleUrlParams = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const successParam = urlParams.get('success');
    const errorParam = urlParams.get('error');
    const licensesAdded = urlParams.get('licenses_added');

    if (successParam === 'purchase_complete' && licensesAdded) {
      toast({
        title: "Payment Successful",
        description: `🎉 Added ${licensesAdded} license${parseInt(licensesAdded) > 1 ? 's' : ''} to your account.`,
        type: "success",
        duration: 8000
      });
      // Clear URL params
      window.history.replaceState({}, document.title, window.location.pathname);
      // Refresh stats to show updated counts
      setTimeout(() => {
        fetchLicenseStats();
        initialFetchLicenses();
      }, 1000);
    } else if (errorParam) {
      const errorMessages: { [key: string]: string } = {
        payment_failed: 'Payment was not successful. Please try again.',
        invalid_license_count: 'Invalid license count received.',
        admin_not_found: 'Admin account not found.',
        update_failed: 'Failed to update license count. Please contact support.',
        unexpected_error: 'An unexpected error occurred. Please try again.'
      };
      
      toast({
        title: "Payment Error",
        description: errorMessages[errorParam] || 'An error occurred during payment processing.',
        type: "error",
        duration: 8000
      });
      
      // Clear URL params
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  };

  const initialFetchLicenses = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: '1',
        limit: '50',
      });
      
      const response = await fetch(`/api/licenses/list?${params}`);
      if (!response.ok) {
        if (response.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('Failed to fetch licenses');
      }
      const data = await response.json();
      setLicenses(data.licenses);
      setStatistics(data.statistics);
      setPagination(data.pagination);
    } catch (err) {
      toast({
        title: "Error",
        description: 'Failed to load licenses',
        type: "error"
      });
      console.error('Fetch licenses error:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkAuthAndFetchLicenses = async () => {
    try {
      const supabase = createClient();
      
      // Check if user is authenticated
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        console.log('No authenticated user, redirecting to login');
        router.push('/login');
        return;
      }

      // Store admin email for purchase
      setAdminEmail(user.email || '');

      // Verify user exists in admins table and has valid role
      const { data: adminData, error: adminError } = await supabase
        .from('admins')
        .select('id, global_role, partner_id')
        .eq('id', user.id)
        .single();

      if (adminError || !adminData) {
        console.log('User not found in admins table, redirecting to login');
        router.push('/login');
        return;
      }

      // Check if user has a valid role for this dashboard
      const validRoles = ['partner_admin', 'member'];
      if (!validRoles.includes(adminData.global_role)) {
        // Moil admins should go to moil-admin dashboard
        if (adminData.global_role === 'moil_admin') {
          router.push('/moil-admin/dashboard');
          return;
        }
        console.log('User does not have valid role for partner dashboard');
        router.push('/login');
        return;
      }

      // Fetch partner info if user has a partner_id
      if (adminData.partner_id) {
        const { data: partnerData } = await supabase
          .from('partners')
          .select('id, name, program_name, logo_url, logo_initial, primary_color, secondary_color, font_family')
          .eq('id', adminData.partner_id)
          .single();
        
        if (partnerData) {
          setPartner(partnerData);
          // Apply partner brand identity to CSS variables
          applyBrandIdentity(partnerData);
        }
      }

      // User is authenticated and has valid role, fetch licenses
      await initialFetchLicenses();
    } catch (err) {
      console.error('Auth check error:', err);
      router.push('/login');
    }
  };

  const fetchLicenses = useCallback(async (page?: number, search?: string, status?: string) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: (page ?? currentPage).toString(),
        limit: '50',
        ...((search ?? searchQuery) && { search: search ?? searchQuery }),
        ...((status ?? statusFilter) && { status: status ?? statusFilter }),
      });
      
      const response = await fetch(`/api/licenses/list?${params}`);
      if (!response.ok) {
        if (response.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('Failed to fetch licenses');
      }
      const data = await response.json();
      setLicenses(data.licenses);
      setStatistics(data.statistics);
      setPagination(data.pagination);
    } catch (err) {
      toast({
        title: "Error",
        description: 'Failed to load licenses',
        type: "error"
      });
      console.error('Fetch licenses error:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchQuery, statusFilter, router, toast]);

  const handlePageChange = useCallback((newPage: number) => {
    setCurrentPage(newPage);
    fetchLicenses(newPage, searchQuery, statusFilter);
  }, [fetchLicenses, searchQuery, statusFilter]);

  const handleSearch = useCallback((search: string) => {
    setSearchQuery(search);
    setCurrentPage(1); // Reset to first page on search
    fetchLicenses(1, search, statusFilter);
  }, [fetchLicenses, statusFilter]);

  const handleStatusFilter = useCallback((status: string) => {
    setStatusFilter(status);
    setCurrentPage(1); // Reset to first page on filter change
    fetchLicenses(1, searchQuery, status);
  }, [fetchLicenses, searchQuery]);

  const fetchLicenseStats = async () => {
    try {
      const response = await fetch('/api/licenses/stats');
      if (!response.ok) {
        throw new Error('Failed to fetch license stats');
      }
      const data = await response.json();
      setLicenseStats(data);
    } catch (err) {
      console.error('Fetch license stats error:', err);
    }
  };

  const handlePurchaseLicenses = async (count: number) => {
    if (!count || count < 1) {
      setPurchaseError('Please enter a valid number of licenses');
      return;
    }

    setPurchasing(true);
    setPurchaseError('');

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_MOIL_PAYMENT_ACTIVATION}/api/stripe/buy-licenses`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-api-key': process.env.NEXT_PUBLIC_QC_API_KEY || '',
        },
        body: JSON.stringify({ 
          name: `Moil Partner ${partner?.program_name}`,
          email: adminEmail,
          numberOfLicenses: count
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setPurchaseError(data.message || 'Failed to initiate purchase');
        setPurchasing(false);
        return;
      }

      // Redirect to Stripe checkout
      if (data.data?.url) {
        window.location.href = data.data.url;
      } else {
        setPurchaseError('No checkout URL received');
        setPurchasing(false);
      }
    } catch (err) {
      setPurchaseError('An error occurred during purchase');
      setPurchasing(false);
    }
  };

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const executeLogout = async () => {
    setShowLogoutConfirm(false);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] font-sans text-[var(--text-primary)]">
      <DashboardHeader 
        onShowActivity={() => setShowActivityPanel(true)}
        onShowTeam={() => setShowTeamManagement(true)}
        onLogout={handleLogout}
        partnerName={partner?.program_name || partner?.name}
        partnerLogo={partner?.logo_url}
        partnerLogoInitial={partner?.logo_initial}
        partnerPrimaryColor={partner?.primary_color}
      />

      <main className="layout-container pb-20 space-y-8 animate-fade-in">
        <LicenseOverview 
          stats={statistics} 
          licenseStats={licenseStats}
          onAddMember={() => {
            // Scroll to the AddLicenseForm section
            document.getElementById('add-license-section')?.scrollIntoView({ behavior: 'smooth' });
          }}
          onViewReports={() => setShowActivityPanel(true)}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
             <LicenseList 
              licenses={licenses}
              loading={loading}
              onRefresh={() => fetchLicenses(currentPage, searchQuery, statusFilter)}
              pagination={pagination || undefined}
              onPageChange={handlePageChange}
              onSearch={handleSearch}
              onStatusFilter={handleStatusFilter}
            />
          </div>
          
          <div className="space-y-6">
            <PurchaseCard 
              purchasedCount={licenseStats.purchased_license_count}
              availableCount={licenseStats.available_licenses}
              onPurchaseClick={() => setShowPurchaseModal(true)}
            />
            
            <div id="add-license-section">
              <AddLicenseForm 
                availableLicenses={licenseStats.available_licenses}
                onLicensesAdded={() => {
                  initialFetchLicenses();
                  fetchLicenseStats();
                }}
              />
            </div>
          </div>
        </div>
      </main>

      {showPurchaseModal && (
        <PurchaseModal 
          onClose={() => {
            setShowPurchaseModal(false);
            setPurchaseError('');
          }}
          onPurchase={handlePurchaseLicenses}
          purchasing={purchasing}
          error={purchaseError}
        />
      )}

      {showTeamManagement && (
        <TeamManagement onClose={() => setShowTeamManagement(false)} />
      )}

      {showActivityPanel && (
        <ActivityPanel onClose={() => setShowActivityPanel(false)} />
      )}

      {/* Logout Confirmation Modal */}
      <ConfirmationModal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={executeLogout}
        title="Logout"
        description="Are you sure you want to logout? You will need to sign in again to access the dashboard."
        confirmText="Logout"
        variant="warning"
      />
    </div>
  );
};

export default DashboardPage;
