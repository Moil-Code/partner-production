'use client';

import useSWR, { mutate } from 'swr';
import { createClient } from '@/lib/supabase/client';

// Global SWR configuration
export const swrConfig = {
  revalidateOnFocus: false, // Don't refetch when window regains focus
  revalidateOnReconnect: true, // Refetch when reconnecting
  dedupingInterval: 5000, // Dedupe requests within 5 seconds
  errorRetryCount: 3, // Retry failed requests 3 times
};

// Cache keys
export const CACHE_KEYS = {
  PARTNERS: 'partners',
  PARTNER: (id: string) => `partner-${id}`,
  TEAMS: 'teams',
  TEAM: (id: string) => `team-${id}`,
  LICENSES: 'licenses',
  TEAM_LICENSES: (teamId: string) => `team-licenses-${teamId}`,
  ADMINS: 'admins',
  PARTNER_ADMINS: (partnerId: string) => `partner-admins-${partnerId}`,
  TEAM_MEMBERS: (teamId: string) => `team-members-${teamId}`,
  STATS: 'stats',
  MOIL_ADMIN_STATS: 'moil-admin-stats',
  PARTNER_STATS: (partnerId: string) => `partner-stats-${partnerId}`,
  TEAM_STATS: (teamId: string) => `team-stats-${teamId}`,
  CURRENT_USER: 'current-user',
  CURRENT_ADMIN: 'current-admin',
};

// Fetcher functions
const supabaseFetcher = async (key: string) => {
  const supabase = createClient();
  
  // Parse the key to determine what to fetch
  if (key === CACHE_KEYS.PARTNERS) {
    const { data, error } = await supabase
      .from('partners')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
  
  if (key.startsWith('partner-') && !key.includes('admins') && !key.includes('stats')) {
    const id = key.replace('partner-', '');
    const { data, error } = await supabase
      .from('partners')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }
  
  if (key === CACHE_KEYS.TEAMS) {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
  
  if (key.startsWith('team-') && !key.includes('licenses') && !key.includes('members') && !key.includes('stats')) {
    const id = key.replace('team-', '');
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }
  
  if (key.startsWith('team-licenses-')) {
    const teamId = key.replace('team-licenses-', '');
    const { data, error } = await supabase
      .from('licenses')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
  
  if (key.startsWith('partner-admins-')) {
    const partnerId = key.replace('partner-admins-', '');
    const { data, error } = await supabase
      .from('admins')
      .select('*')
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  }
  
  if (key.startsWith('team-members-')) {
    const teamId = key.replace('team-members-', '');
    const { data, error } = await supabase
      .from('team_members')
      .select('*, admin:admins(email, first_name, last_name)')
      .eq('team_id', teamId)
      .order('joined_at', { ascending: true });
    if (error) throw error;
    return data;
  }
  
  if (key === CACHE_KEYS.CURRENT_USER) {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
  }
  
  if (key === CACHE_KEYS.CURRENT_ADMIN) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    
    const { data, error } = await supabase
      .from('admins')
      .select('*, partner:partners(*)')
      .eq('id', user.id)
      .single();
    if (error) throw error;
    return data;
  }
  
  return null;
};

// Custom hooks for data fetching with caching

export function usePartners() {
  const { data, error, isLoading, mutate: revalidate } = useSWR(
    CACHE_KEYS.PARTNERS,
    supabaseFetcher,
    swrConfig
  );
  
  return {
    partners: data || [],
    isLoading,
    error,
    refresh: () => revalidate(),
  };
}

export function usePartner(partnerId: string | null) {
  const { data, error, isLoading, mutate: revalidate } = useSWR(
    partnerId ? CACHE_KEYS.PARTNER(partnerId) : null,
    supabaseFetcher,
    swrConfig
  );
  
  return {
    partner: data,
    isLoading,
    error,
    refresh: () => revalidate(),
  };
}

export function useTeams() {
  const { data, error, isLoading, mutate: revalidate } = useSWR(
    CACHE_KEYS.TEAMS,
    supabaseFetcher,
    swrConfig
  );
  
  return {
    teams: data || [],
    isLoading,
    error,
    refresh: () => revalidate(),
  };
}

export function useTeam(teamId: string | null) {
  const { data, error, isLoading, mutate: revalidate } = useSWR(
    teamId ? CACHE_KEYS.TEAM(teamId) : null,
    supabaseFetcher,
    swrConfig
  );
  
  return {
    team: data,
    isLoading,
    error,
    refresh: () => revalidate(),
  };
}

export function useTeamLicenses(teamId: string | null) {
  const { data, error, isLoading, mutate: revalidate } = useSWR(
    teamId ? CACHE_KEYS.TEAM_LICENSES(teamId) : null,
    supabaseFetcher,
    swrConfig
  );
  
  return {
    licenses: data || [],
    isLoading,
    error,
    refresh: () => revalidate(),
  };
}

export function usePartnerAdmins(partnerId: string | null) {
  const { data, error, isLoading, mutate: revalidate } = useSWR(
    partnerId ? CACHE_KEYS.PARTNER_ADMINS(partnerId) : null,
    supabaseFetcher,
    swrConfig
  );
  
  return {
    admins: data || [],
    isLoading,
    error,
    refresh: () => revalidate(),
  };
}

export function useTeamMembers(teamId: string | null) {
  const { data, error, isLoading, mutate: revalidate } = useSWR(
    teamId ? CACHE_KEYS.TEAM_MEMBERS(teamId) : null,
    supabaseFetcher,
    swrConfig
  );
  
  return {
    members: data || [],
    isLoading,
    error,
    refresh: () => revalidate(),
  };
}

export function useCurrentUser() {
  const { data, error, isLoading, mutate: revalidate } = useSWR(
    CACHE_KEYS.CURRENT_USER,
    supabaseFetcher,
    { ...swrConfig, revalidateOnMount: true }
  );
  
  return {
    user: data,
    isLoading,
    error,
    refresh: () => revalidate(),
  };
}

export function useCurrentAdmin() {
  const { data, error, isLoading, mutate: revalidate } = useSWR(
    CACHE_KEYS.CURRENT_ADMIN,
    supabaseFetcher,
    { ...swrConfig, revalidateOnMount: true }
  );
  
  return {
    admin: data,
    isLoading,
    error,
    refresh: () => revalidate(),
  };
}

// Utility functions for cache management

/**
 * Invalidate specific cache keys
 */
export function invalidateCache(...keys: string[]) {
  keys.forEach(key => mutate(key));
}

/**
 * Invalidate all caches (useful after major data changes)
 */
export function invalidateAllCaches() {
  Object.values(CACHE_KEYS).forEach(key => {
    if (typeof key === 'string') {
      mutate(key);
    }
  });
}

/**
 * Invalidate partner-related caches
 */
export function invalidatePartnerCaches(partnerId?: string) {
  mutate(CACHE_KEYS.PARTNERS);
  if (partnerId) {
    mutate(CACHE_KEYS.PARTNER(partnerId));
    mutate(CACHE_KEYS.PARTNER_ADMINS(partnerId));
    mutate(CACHE_KEYS.PARTNER_STATS(partnerId));
  }
}

/**
 * Invalidate team-related caches
 */
export function invalidateTeamCaches(teamId?: string) {
  mutate(CACHE_KEYS.TEAMS);
  if (teamId) {
    mutate(CACHE_KEYS.TEAM(teamId));
    mutate(CACHE_KEYS.TEAM_LICENSES(teamId));
    mutate(CACHE_KEYS.TEAM_MEMBERS(teamId));
    mutate(CACHE_KEYS.TEAM_STATS(teamId));
  }
}

/**
 * Invalidate license-related caches
 */
export function invalidateLicenseCaches(teamId?: string) {
  mutate(CACHE_KEYS.LICENSES);
  if (teamId) {
    mutate(CACHE_KEYS.TEAM_LICENSES(teamId));
    mutate(CACHE_KEYS.TEAM_STATS(teamId));
  }
}
