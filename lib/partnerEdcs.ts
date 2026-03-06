import partnerEdcsData from './partnerEdcs.json';

export interface EdcFeatures {
  jobPosts: number;
  aiCoach: boolean;
  marketResearch: boolean;
  businessTemplates: boolean;
}

export interface PartnerBranding {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  logoUrl: string;
  logoInitial: string;
  fontFamily: string;
}

export interface PartnerEdc {
  id: string;
  name: string;
  fullName: string;
  programName: string;
  domain: string;
  city: string;
  state: string;
  country: string;
  branding: PartnerBranding;
  supportEmail: string;
  licenseDuration: string;
  features: EdcFeatures;
  // Legacy flat properties for backward compatibility
  primaryColor?: string;
  accentColor?: string;
  logo?: string;
  logoInitial?: string;
}

export const partnerEdcs: PartnerEdc[] = partnerEdcsData.partners as PartnerEdc[];

/**
 * Get a partner EDC by admin email domain
 */
export function getEdcByEmail(email: string): PartnerEdc | undefined {
  const domain = email.split('@')[1];
  return partnerEdcs.find(edc => edc.domain === domain);
}

/**
 * Default Moil Partners EDC configuration
 */
const DEFAULT_MOIL_EDC: PartnerEdc = {
  id: 'moil-default',
  name: 'Moil',
  fullName: 'Moil Partners',
  programName: 'Moil Partners',
  domain: 'moilapp.com',
  city: 'Austin',
  state: 'TX',
  country: 'USA',
  branding: {
    primaryColor: '#5843BE',
    secondaryColor: '#FF6633',
    accentColor: '#10B981',
    textColor: '#0F172A',
    logoUrl: 'https://res.cloudinary.com/drlcisipo/image/upload/v1705704261/Website%20images/logo_gox0fw.png',
    logoInitial: 'M',
    fontFamily: 'Interstate, sans-serif',
  },
  supportEmail: 'support@moilapp.com',
  licenseDuration: '12 months',
  features: {
    jobPosts: 10,
    aiCoach: true,
    marketResearch: true,
    businessTemplates: true,
  },
  primaryColor: '#5843BE',
  accentColor: '#10B981',
  logo: 'https://res.cloudinary.com/drlcisipo/image/upload/v1705704261/Website%20images/logo_gox0fw.png',
  logoInitial: 'M',
};

/**
 * Get the default EDC (Moil Partners)
 */
export function getDefaultEdc(): PartnerEdc {
  return partnerEdcs[0] || DEFAULT_MOIL_EDC;
}
