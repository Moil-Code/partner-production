'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast/use-toast';
import Logo from '@/components/ui/Logo';
import { LicenseRowActions } from '@/components/Dashboard/LicenseRowActions';
import {
  ArrowLeft,
  Key,
  Search,
  Mail,
  CheckCircle,
  Clock,
  Building2
} from 'lucide-react';

interface License {
  id: string;
  email: string;
  business_name: string;
  is_activated: boolean;
  created_at: string;
  activated_at: string | null;
  team_id: string | null;
  admin_id: string;
}

interface Partner {
  id: string;
  name: string;
  domain: string;
}

function LicensesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  const partnerId = searchParams.get('partnerId');
  
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    checkAuthAndFetchData();
  }, [partnerId]);

  const checkAuthAndFetchData = async () => {
    try {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        router.push('/login');
        return;
      }

      // Check if user is Moil admin
      const { data: admin, error: adminError } = await supabase
        .from('admins')
        .select('email, global_role')
        .eq('id', user.id)
        .single();

      if (adminError || !admin || !admin.email.endsWith('@moilapp.com')) {
        toast({
          title: 'Access Denied',
          description: 'This page is only accessible to @moilapp.com accounts',
          type: 'error',
        });
        router.push('/moil-admin/dashboard');
        return;
      }

      setIsAuthorized(true);

      if (!partnerId) {
        toast({
          title: 'Error',
          description: 'Partner ID is required',
          type: 'error',
        });
        router.push('/moil-admin/dashboard');
        return;
      }

      // Fetch partner info
      const { data: partnerData, error: partnerError } = await supabase
        .from('partners')
        .select('id, name, domain')
        .eq('id', partnerId)
        .single();

      if (partnerError || !partnerData) {
        toast({
          title: 'Error',
          description: 'Partner not found',
          type: 'error',
        });
        router.push('/moil-admin/dashboard');
        return;
      }

      setPartner(partnerData);

      // Fetch licenses for this partner
      const { data: licensesData, error: licensesError } = await supabase
        .from('licenses')
        .select('*')
        .eq('partner_id', partnerId)
        .order('created_at', { ascending: false });

      if (licensesError) {
        console.error('Error fetching licenses:', licensesError);
      } else {
        setLicenses(licensesData || []);
      }
    } catch (error) {
      console.error('Error:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const filteredLicenses = licenses.filter(l => {
    const query = searchQuery.toLowerCase();
    return l.email.toLowerCase().includes(query) ||
           (l.business_name && l.business_name.toLowerCase().includes(query));
  });

  const activatedCount = licenses.filter(l => l.is_activated).length;
  const pendingCount = licenses.filter(l => !l.is_activated).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" variant="primary" className="mx-auto" />
          <p className="mt-4 text-[var(--text-secondary)]">Loading licenses...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[var(--background)] font-sans text-[var(--text-primary)]">
      {/* Header */}
      <header className="glass-panel border-b border-[var(--border)] sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => router.push('/moil-admin/dashboard')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Key className="w-5 h-5 text-[var(--primary)]" />
                  License Management
                </h1>
                <p className="text-sm text-[var(--text-secondary)] flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  {partner?.name} • {partner?.domain}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card variant="glass">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--text-secondary)] mb-1">Total Licenses</p>
                  <p className="text-3xl font-bold text-[var(--text-primary)]">{licenses.length}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] flex items-center justify-center">
                  <Key className="w-6 h-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card variant="glass">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--text-secondary)] mb-1">Activated</p>
                  <p className="text-3xl font-bold text-green-600">{activatedCount}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-green-400 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card variant="glass">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--text-secondary)] mb-1">Pending</p>
                  <p className="text-3xl font-bold text-amber-600">{pendingCount}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-400 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Licenses List */}
        <Card variant="glass">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Licenses</CardTitle>
                <CardDescription>All licenses for this partner</CardDescription>
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
                  placeholder="Search licenses..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all text-[var(--text-primary)]"
                />
              </div>
            </div>

            {/* Licenses Table */}
            {filteredLicenses.length === 0 ? (
              <div className="text-center py-12">
                <Key className="w-12 h-12 text-[var(--text-tertiary)] mx-auto mb-4" />
                <p className="text-[var(--text-secondary)]">No licenses found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-[var(--text-secondary)]">Email</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-[var(--text-secondary)]">Business</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-[var(--text-secondary)]">Status</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-[var(--text-secondary)]">Created</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-[var(--text-secondary)]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLicenses.map((license) => (
                      <tr key={license.id} className="border-b border-[var(--border)] hover:bg-[var(--surface-subtle)] transition-colors">
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-[var(--text-tertiary)]" />
                            <span className="font-medium text-[var(--text-primary)]">{license.email}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-[var(--text-secondary)]">
                          {license.business_name || '-'}
                        </td>
                        <td className="py-4 px-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            license.is_activated 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {license.is_activated ? 'Activated' : 'Pending'}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-[var(--text-secondary)] text-sm">
                          {new Date(license.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-4 px-4 text-right">
                          <LicenseRowActions
                            license={license}
                            onChanged={checkAuthAndFetchData}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function MoilAdminLicensesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" variant="primary" className="mx-auto" />
          <p className="mt-4 text-[var(--text-secondary)]">Loading...</p>
        </div>
      </div>
    }>
      <LicensesContent />
    </Suspense>
  );
}
