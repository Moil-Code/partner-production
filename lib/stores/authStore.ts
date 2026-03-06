import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createClient } from '@/lib/supabase/client';

interface Admin {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  global_role: string;
  partner_id: string | null;
  partner?: {
    id: string;
    name: string;
    domain: string;
    primary_color: string;
    secondary_color: string;
    logo_url: string | null;
    logo_initial: string;
    program_name: string;
    status: string;
  } | null;
}

interface User {
  id: string;
  email: string;
}

interface AuthState {
  user: User | null;
  admin: Admin | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isMoilAdmin: boolean;
  isPartnerAdmin: boolean;
  lastFetched: number | null;
  
  // Actions
  setUser: (user: User | null) => void;
  setAdmin: (admin: Admin | null) => void;
  setLoading: (loading: boolean) => void;
  fetchAuth: () => Promise<void>;
  logout: () => Promise<void>;
  reset: () => void;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      admin: null,
      isLoading: true,
      isAuthenticated: false,
      isMoilAdmin: false,
      isPartnerAdmin: false,
      lastFetched: null,

      setUser: (user) => set({ 
        user, 
        isAuthenticated: !!user 
      }),

      setAdmin: (admin) => set({ 
        admin,
        isMoilAdmin: admin?.global_role === 'moil_admin' || admin?.email?.endsWith('@moilapp.com') || false,
        isPartnerAdmin: admin?.global_role === 'partner_admin' || false,
      }),

      setLoading: (isLoading) => set({ isLoading }),

      fetchAuth: async () => {
        const state = get();
        const now = Date.now();
        
        // Return cached data if still valid
        if (state.lastFetched && (now - state.lastFetched) < CACHE_DURATION && state.user) {
          set({ isLoading: false });
          return;
        }

        set({ isLoading: true });
        
        try {
          const supabase = createClient();
          const { data: { user }, error: authError } = await supabase.auth.getUser();

          if (authError || !user) {
            set({ 
              user: null, 
              admin: null, 
              isAuthenticated: false,
              isMoilAdmin: false,
              isPartnerAdmin: false,
              isLoading: false,
              lastFetched: now,
            });
            return;
          }

          // Fetch admin data with partner info
          const { data: adminData } = await supabase
            .from('admins')
            .select('*, partner:partners(*)')
            .eq('id', user.id)
            .single();

          set({
            user: { id: user.id, email: user.email || '' },
            admin: adminData || null,
            isAuthenticated: true,
            isMoilAdmin: adminData?.global_role === 'moil_admin' || adminData?.email?.endsWith('@moilapp.com') || false,
            isPartnerAdmin: adminData?.global_role === 'partner_admin' || false,
            isLoading: false,
            lastFetched: now,
          });
        } catch (error) {
          console.error('Auth fetch error:', error);
          set({ 
            isLoading: false,
            lastFetched: now,
          });
        }
      },

      logout: async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        set({
          user: null,
          admin: null,
          isAuthenticated: false,
          isMoilAdmin: false,
          isPartnerAdmin: false,
          lastFetched: null,
        });
      },

      reset: () => set({
        user: null,
        admin: null,
        isLoading: true,
        isAuthenticated: false,
        isMoilAdmin: false,
        isPartnerAdmin: false,
        lastFetched: null,
      }),
    }),
    {
      name: 'moil-auth-storage',
      partialize: (state) => ({ 
        user: state.user,
        admin: state.admin,
        isAuthenticated: state.isAuthenticated,
        isMoilAdmin: state.isMoilAdmin,
        isPartnerAdmin: state.isPartnerAdmin,
        lastFetched: state.lastFetched,
      }),
    }
  )
);
