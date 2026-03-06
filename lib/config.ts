import baseUrlConfig from './baseUrl.json';

/**
 * Get the base URL for the current environment
 * Checks environment variables and falls back to production URL
 */
export function getBaseUrl(): string {
  // Check if we're in a browser environment
  if (typeof window !== 'undefined') {
    // In browser, use the current origin
    return window.location.origin;
  }

  // In server environment, check environment variables
  const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV;
  
  // If deployed on Vercel
  if (vercelEnv) {
    // Production environment
    if (vercelEnv === 'production') {
      return baseUrlConfig.production;
    }
    // Staging/preview environment
    return baseUrlConfig.staging;
  }

  // Check for custom environment variable
  const customUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (customUrl) {
    return customUrl;
  }

  // Default to production URL
  return baseUrlConfig.production;
}

/**
 * Get the full URL for an asset (e.g., logo, images)
 */
export function getAssetUrl(path: string): string {
  const baseUrl = getBaseUrl();
  // Remove leading slash if present to avoid double slashes
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${baseUrl}/${cleanPath}`;
}

/**
 * Get logo URL for the current environment
 */
export function getLogoUrl(): string {
  return getAssetUrl('logo.png');
}
