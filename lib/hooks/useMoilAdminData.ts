'use client';

import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';

interface Partner {
  id: string;
  name: string;
  domain: string;
  status: string;
  created_at: string;
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
}

interface Stats {
  total_partners: number;
  active_partners: number;
  pending_partners: number;
  total_licenses: number;
  total_teams: number;
  total_admins: number;
}

interface MoilAdminDashboardData {
  partners: Partner[];
  teams: Team[];
  stats: Stats;
}

const fetchMoilAdminDashboardData = async (): Promise<MoilAdminDashboardData> => {
  const supabase = createClient();

  // Fetch all partners
  const { data: partnersData, error: partnersError } = await supabase
    .from('partners')
    .select('id, name, domain, status, created_at')
    .order('created_at', { ascending: false });

  if (partnersError) throw partnersError;
  const partners = partnersData || [];

  // Fetch all teams
  const { data: teamsData, error: teamsError } = await supabase
    .from('teams')
    .select('id, name, domain, partner_id, created_at')
    .order('created_at', { ascending: false });

  let teams: Team[] = [];
  
  if (!teamsError && teamsData) {
    // Get partner names for each team
    const partnerIds = [...new Set(teamsData.filter(t => t.partner_id).map(t => t.partner_id))];
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
    const teamIds = teamsData.map(t => t.id);
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

    teams = teamsData.map((team) => ({
      id: team.id,
      name: team.name,
      domain: team.domain,
      partner_id: team.partner_id,
      partner_name: team.partner_id ? partnerMap[team.partner_id] || 'Unknown' : 'No Partner',
      created_at: team.created_at,
      license_count: licenseCountMap[team.id] || 0,
    }));
  }

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

  return { partners, teams, stats };
};

export function useMoilAdminDashboard() {
  const { data, error, isLoading, mutate } = useSWR(
    'moil-admin-dashboard',
    fetchMoilAdminDashboardData,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
      keepPreviousData: true,
    }
  );

  return {
    partners: data?.partners || [],
    teams: data?.teams || [],
    stats: data?.stats || null,
    isLoading,
    error,
    refresh: () => mutate(),
  };
}

// Hook for partner detail page
interface PartnerDetail {
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

interface PartnerTeam {
  id: string;
  name: string;
  domain: string;
  purchased_license_count: number;
  created_at: string;
  license_count?: number;
}

interface PartnerDetailData {
  partner: PartnerDetail;
  admins: Admin[];
  teams: PartnerTeam[];
  totalLicenseCount: number;
}

const fetchPartnerDetail = async (partnerId: string): Promise<PartnerDetailData | null> => {
  const supabase = createClient();

  // Fetch partner details
  const { data: partnerData, error: partnerError } = await supabase
    .from('partners')
    .select('*')
    .eq('id', partnerId)
    .single();

  if (partnerError || !partnerData) {
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

  return {
    partner: partnerData,
    admins: adminsData || [],
    teams: teamsWithLicenses,
    totalLicenseCount: totalLicenses,
  };
};

export function usePartnerDetail(partnerId: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    partnerId ? `partner-detail-${partnerId}` : null,
    () => partnerId ? fetchPartnerDetail(partnerId) : null,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
      keepPreviousData: true,
    }
  );

  return {
    partner: data?.partner || null,
    admins: data?.admins || [],
    teams: data?.teams || [],
    totalLicenseCount: data?.totalLicenseCount || 0,
    isLoading,
    error,
    refresh: () => mutate(),
  };
}

// Hook for team detail page
interface TeamDetail {
  id: string;
  name: string;
  domain: string;
  partner_id: string;
  owner_id: string;
  purchased_license_count: number;
  created_at: string;
}

interface TeamPartner {
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

interface TeamDetailData {
  team: TeamDetail;
  partner: TeamPartner | null;
  members: TeamMember[];
  licenses: License[];
  invitations: TeamInvitation[];
}

const fetchTeamDetail = async (teamId: string): Promise<TeamDetailData | null> => {
  const supabase = createClient();

  // Fetch team details
  const { data: teamData, error: teamError } = await supabase
    .from('teams')
    .select('*')
    .eq('id', teamId)
    .single();

  if (teamError || !teamData) {
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

  return {
    team: teamData,
    partner: partnerData,
    members: membersData || [],
    licenses: licensesData || [],
    invitations: invitationsData || [],
  };
};

export function useTeamDetail(teamId: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    teamId ? `team-detail-${teamId}` : null,
    () => teamId ? fetchTeamDetail(teamId) : null,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
      keepPreviousData: true,
    }
  );

  return {
    team: data?.team || null,
    partner: data?.partner || null,
    members: data?.members || [],
    licenses: data?.licenses || [],
    invitations: data?.invitations || [],
    isLoading,
    error,
    refresh: () => mutate(),
  };
}
