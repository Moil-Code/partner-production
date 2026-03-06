import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type TabType = 'overview' | 'partners' | 'teams' | 'licenses';

interface UIState {
  // Moil Admin Dashboard
  moilAdminActiveTab: TabType;
  moilAdminSearchQuery: string;
  
  // Partner Admin Dashboard
  partnerAdminActiveTab: TabType;
  partnerAdminSearchQuery: string;
  
  // Sidebar state
  sidebarCollapsed: boolean;
  
  // Modal states
  modals: Record<string, boolean>;
  
  // Actions
  setMoilAdminActiveTab: (tab: TabType) => void;
  setMoilAdminSearchQuery: (query: string) => void;
  setPartnerAdminActiveTab: (tab: TabType) => void;
  setPartnerAdminSearchQuery: (query: string) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  openModal: (modalId: string) => void;
  closeModal: (modalId: string) => void;
  toggleModal: (modalId: string) => void;
  resetUI: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      moilAdminActiveTab: 'overview',
      moilAdminSearchQuery: '',
      partnerAdminActiveTab: 'overview',
      partnerAdminSearchQuery: '',
      sidebarCollapsed: false,
      modals: {},

      setMoilAdminActiveTab: (tab) => set({ moilAdminActiveTab: tab }),
      setMoilAdminSearchQuery: (query) => set({ moilAdminSearchQuery: query }),
      setPartnerAdminActiveTab: (tab) => set({ partnerAdminActiveTab: tab }),
      setPartnerAdminSearchQuery: (query) => set({ partnerAdminSearchQuery: query }),
      
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      
      openModal: (modalId) => set((state) => ({ 
        modals: { ...state.modals, [modalId]: true } 
      })),
      closeModal: (modalId) => set((state) => ({ 
        modals: { ...state.modals, [modalId]: false } 
      })),
      toggleModal: (modalId) => set((state) => ({ 
        modals: { ...state.modals, [modalId]: !state.modals[modalId] } 
      })),
      
      resetUI: () => set({
        moilAdminActiveTab: 'overview',
        moilAdminSearchQuery: '',
        partnerAdminActiveTab: 'overview',
        partnerAdminSearchQuery: '',
        modals: {},
      }),
    }),
    {
      name: 'moil-ui-storage',
      partialize: (state) => ({ 
        sidebarCollapsed: state.sidebarCollapsed,
        moilAdminActiveTab: state.moilAdminActiveTab,
        partnerAdminActiveTab: state.partnerAdminActiveTab,
      }),
    }
  )
);
