import { create } from 'zustand';
import { createClient } from '@/lib/supabase/client';

interface Team {
  id: string;
  name: string;
  domain: string;
  partner_id: string;
  partner_name?: string;
  owner_id: string;
  purchased_license_count: number;
  created_at: string;
  license_count?: number;
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

interface TeamDetail {
  team: Team | null;
  partner: Partner | null;
  members: TeamMember[];
  licenses: License[];
  invitations: TeamInvitation[];
}

interface TeamState {
  // List data
  teams: Team[];
  isLoading: boolean;
  lastFetched: number | null;
  
  // Detail data (cached by ID)
  teamDetails: Record<string, TeamDetail>;
  detailsLoading: Record<string, boolean>;
  detailsLastFetched: Record<string, number>;
  
  // Actions
  fetchTeams: () => Promise<void>;
  fetchTeamDetail: (teamId: string) => Promise<TeamDetail | null>;
  invalidateTeam: (teamId: string) => void;
  invalidateAll: () => void;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const useTeamStore = create<TeamState>((set, get) => ({
  teams: [],
  isLoading: false,
  lastFetched: null,
  teamDetails: {},
  detailsLoading: {},
  detailsLastFetched: {},

  fetchTeams: async () => {
    const state = get();
    const now = Date.now();
    
    // Return cached data if still valid
    if (state.lastFetched && (now - state.lastFetched) < CACHE_DURATION && state.teams.length > 0) {
      return;
    }

    set({ isLoading: true });
    
    try {
      const supabase = createClient();

      // Fetch all teams
      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select('*')
        .order('created_at', { ascending: false });

      if (teamsError) throw teamsError;

      const teams = teamsData || [];

      // Get partner names for each team
      const partnerIds = [...new Set(teams.filter(t => t.partner_id).map(t => t.partner_id))];
      let partnerMap: Record<string, string> = {};
      
      if (partnerIds.length > 0) {
        const { data: partnerNames } = await supabase
          .from('partners')
          .select('id, name')
          .in('id', partnerIds);
        
        if (partnerNames) {
          partnerMap = partnerNames.reduce((acc: Record<string, string>, p) => {
            acc[p.id] = p.name;
            return acc;
          }, {});
        }
      }

      // Get license counts for each team
      const teamIds = teams.map(t => t.id);
      let licenseCountMap: Record<string, number> = {};
      
      if (teamIds.length > 0) {
        const { data: licenseCounts } = await supabase
          .from('licenses')
          .select('team_id')
          .in('team_id', teamIds);

        if (licenseCounts) {
          licenseCounts.forEach((l: { team_id: string }) => {
            licenseCountMap[l.team_id] = (licenseCountMap[l.team_id] || 0) + 1;
          });
        }
      }

      const teamsWithDetails = teams.map((team) => ({
        ...team,
        partner_name: team.partner_id ? partnerMap[team.partner_id] || 'Unknown' : 'No Partner',
        license_count: licenseCountMap[team.id] || 0,
      }));

      set({
        teams: teamsWithDetails,
        isLoading: false,
        lastFetched: now,
      });
    } catch (error) {
      console.error('Error fetching teams:', error);
      set({ isLoading: false });
    }
  },

  fetchTeamDetail: async (teamId: string) => {
    const state = get();
    const now = Date.now();
    
    // Return cached data if still valid
    const cachedDetail = state.teamDetails[teamId];
    const lastFetched = state.detailsLastFetched[teamId];
    if (cachedDetail && lastFetched && (now - lastFetched) < CACHE_DURATION) {
      return cachedDetail;
    }

    set(s => ({ 
      detailsLoading: { ...s.detailsLoading, [teamId]: true } 
    }));
    
    try {
      const supabase = createClient();

      // Fetch team details
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .single();

      if (teamError || !teamData) {
        set(s => ({ 
          detailsLoading: { ...s.detailsLoading, [teamId]: false } 
        }));
        return null;
      }

      // Fetch partner info if team has a partner
      let partnerData = null;
      if (teamData.partner_id) {
        const { data } = await supabase
          .from('partners')
          .select('id, name, domain, primary_color, logo_url')
          .eq('id', teamData.partner_id)
          .single();
        partnerData = data;
      }

      // Fetch team members with admin info
      const { data: membersData } = await supabase
        .from('team_members')
        .select('*, admin:admins(email, first_name, last_name)')
        .eq('team_id', teamId)
        .order('joined_at', { ascending: true });

      // Fetch licenses
      const { data: licensesData } = await supabase
        .from('licenses')
        .select('id, email, business_name, is_activated, activated_at, created_at')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false });

      // Fetch pending invitations
      const { data: invitationsData } = await supabase
        .from('team_invitations')
        .select('*')
        .eq('team_id', teamId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      const detail: TeamDetail = {
        team: teamData,
        partner: partnerData,
        members: membersData || [],
        licenses: licensesData || [],
        invitations: invitationsData || [],
      };

      set(s => ({
        teamDetails: { ...s.teamDetails, [teamId]: detail },
        detailsLoading: { ...s.detailsLoading, [teamId]: false },
        detailsLastFetched: { ...s.detailsLastFetched, [teamId]: now },
      }));

      return detail;
    } catch (error) {
      console.error('Error fetching team detail:', error);
      set(s => ({ 
        detailsLoading: { ...s.detailsLoading, [teamId]: false } 
      }));
      return null;
    }
  },

  invalidateTeam: (teamId: string) => {
    set(s => {
      const { [teamId]: _, ...restDetails } = s.teamDetails;
      const { [teamId]: __, ...restLoading } = s.detailsLoading;
      const { [teamId]: ___, ...restFetched } = s.detailsLastFetched;
      return {
        teamDetails: restDetails,
        detailsLoading: restLoading,
        detailsLastFetched: restFetched,
      };
    });
  },

  invalidateAll: () => {
    set({
      teams: [],
      lastFetched: null,
      teamDetails: {},
      detailsLoading: {},
      detailsLastFetched: {},
    });
  },
}));
