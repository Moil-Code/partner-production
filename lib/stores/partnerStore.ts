import { create } from 'zustand';
import { createClient } from '@/lib/supabase/client';

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
  partner_id: string;
  partner_name?: string;
  purchased_license_count: number;
  created_at: string;
  license_count?: number;
}

interface PartnerDetail {
  partner: Partner | null;
  admins: Admin[];
  teams: Team[];
  totalLicenseCount: number;
}

interface Stats {
  total_partners: number;
  active_partners: number;
  pending_partners: number;
  total_licenses: number;
  total_teams: number;
  total_admins: number;
}

interface PartnerState {
  // List data
  partners: Partner[];
  stats: Stats | null;
  isLoading: boolean;
  lastFetched: number | null;
  
  // Detail data (cached by ID)
  partnerDetails: Record<string, PartnerDetail>;
  detailsLoading: Record<string, boolean>;
  detailsLastFetched: Record<string, number>;
  
  // Actions
  fetchPartners: () => Promise<void>;
  fetchPartnerDetail: (partnerId: string) => Promise<PartnerDetail | null>;
  updatePartnerStatus: (partnerId: string, status: string) => Promise<boolean>;
  invalidatePartner: (partnerId: string) => void;
  invalidateAll: () => void;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const usePartnerStore = create<PartnerState>((set, get) => ({
  partners: [],
  stats: null,
  isLoading: false,
  lastFetched: null,
  partnerDetails: {},
  detailsLoading: {},
  detailsLastFetched: {},

  fetchPartners: async () => {
    const state = get();
    const now = Date.now();
    
    // Return cached data if still valid
    if (state.lastFetched && (now - state.lastFetched) < CACHE_DURATION && state.partners.length > 0) {
      return;
    }

    set({ isLoading: true });
    
    try {
      const supabase = createClient();

      // Fetch all partners
      const { data: partnersData, error: partnersError } = await supabase
        .from('partners')
        .select('*')
        .order('created_at', { ascending: false });

      if (partnersError) throw partnersError;

      const partners = partnersData || [];

      // Calculate stats
      const totalPartners = partners.length;
      const activePartners = partners.filter(p => p.status === 'active').length;
      const pendingPartners = partners.filter(p => p.status === 'pending').length;

      // Fetch counts
      const [licenseResult, teamResult, adminResult] = await Promise.all([
        supabase.from('licenses').select('id', { count: 'exact', head: true }),
        supabase.from('teams').select('id', { count: 'exact', head: true }),
        supabase.from('admins').select('id', { count: 'exact', head: true }),
      ]);

      const stats: Stats = {
        total_partners: totalPartners,
        active_partners: activePartners,
        pending_partners: pendingPartners,
        total_licenses: licenseResult.count || 0,
        total_teams: teamResult.count || 0,
        total_admins: adminResult.count || 0,
      };

      set({
        partners,
        stats,
        isLoading: false,
        lastFetched: now,
      });
    } catch (error) {
      console.error('Error fetching partners:', error);
      set({ isLoading: false });
    }
  },

  fetchPartnerDetail: async (partnerId: string) => {
    const state = get();
    const now = Date.now();
    
    // Return cached data if still valid
    const cachedDetail = state.partnerDetails[partnerId];
    const lastFetched = state.detailsLastFetched[partnerId];
    if (cachedDetail && lastFetched && (now - lastFetched) < CACHE_DURATION) {
      return cachedDetail;
    }

    set(s => ({ 
      detailsLoading: { ...s.detailsLoading, [partnerId]: true } 
    }));
    
    try {
      const supabase = createClient();

      // Fetch partner details
      const { data: partnerData, error: partnerError } = await supabase
        .from('partners')
        .select('*')
        .eq('id', partnerId)
        .single();

      if (partnerError || !partnerData) {
        set(s => ({ 
          detailsLoading: { ...s.detailsLoading, [partnerId]: false } 
        }));
        return null;
      }

      // Fetch admins for this partner
      const { data: adminsData } = await supabase
        .from('admins')
        .select('*')
        .eq('partner_id', partnerId)
        .order('created_at', { ascending: true });

      // Fetch teams for this partner
      const { data: teamsData } = await supabase
        .from('teams')
        .select('*')
        .eq('partner_id', partnerId)
        .order('created_at', { ascending: true });

      // Fetch license counts for each team
      let totalLicenses = 0;
      const teamsWithLicenses = await Promise.all(
        (teamsData || []).map(async (team) => {
          const { count } = await supabase
            .from('licenses')
            .select('*', { count: 'exact', head: true })
            .eq('team_id', team.id);
          const licenseCount = count || 0;
          totalLicenses += licenseCount;
          return { ...team, license_count: licenseCount };
        })
      );

      const detail: PartnerDetail = {
        partner: partnerData,
        admins: adminsData || [],
        teams: teamsWithLicenses,
        totalLicenseCount: totalLicenses,
      };

      set(s => ({
        partnerDetails: { ...s.partnerDetails, [partnerId]: detail },
        detailsLoading: { ...s.detailsLoading, [partnerId]: false },
        detailsLastFetched: { ...s.detailsLastFetched, [partnerId]: now },
      }));

      return detail;
    } catch (error) {
      console.error('Error fetching partner detail:', error);
      set(s => ({ 
        detailsLoading: { ...s.detailsLoading, [partnerId]: false } 
      }));
      return null;
    }
  },

  updatePartnerStatus: async (partnerId: string, status: string) => {
    try {
      const supabase = createClient();
      
      const { error } = await supabase
        .from('partners')
        .update({ status })
        .eq('id', partnerId);

      if (error) throw error;

      // Update local state
      set(s => ({
        partners: s.partners.map(p => 
          p.id === partnerId ? { ...p, status } : p
        ),
        stats: s.stats ? {
          ...s.stats,
          active_partners: s.partners.filter(p => 
            p.id === partnerId ? status === 'active' : p.status === 'active'
          ).length,
          pending_partners: s.partners.filter(p => 
            p.id === partnerId ? status === 'pending' : p.status === 'pending'
          ).length,
        } : null,
      }));

      // Invalidate detail cache
      get().invalidatePartner(partnerId);

      return true;
    } catch (error) {
      console.error('Error updating partner status:', error);
      return false;
    }
  },

  invalidatePartner: (partnerId: string) => {
    set(s => {
      const { [partnerId]: _, ...restDetails } = s.partnerDetails;
      const { [partnerId]: __, ...restLoading } = s.detailsLoading;
      const { [partnerId]: ___, ...restFetched } = s.detailsLastFetched;
      return {
        partnerDetails: restDetails,
        detailsLoading: restLoading,
        detailsLastFetched: restFetched,
      };
    });
  },

  invalidateAll: () => {
    set({
      partners: [],
      stats: null,
      lastFetched: null,
      partnerDetails: {},
      detailsLoading: {},
      detailsLastFetched: {},
    });
  },
}));
