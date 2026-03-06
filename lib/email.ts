import { Resend } from 'resend';
import { LicenseActivationEmail } from '../emails/license-activation';
import { TeamInvitationEmail } from '../emails/team-invitation';
import { PartnerAccessRequestEmail } from '../emails/partner-access-request';
import { PartnerApprovedEmail } from '../emails/partner-approved';
import { getEdcByEmail, getDefaultEdc, type PartnerEdc } from './partnerEdcs';
import { getLogoUrl, getBaseUrl } from './config';

// Initialize Resend with API key
const resend = new Resend(process.env.RESEND_API);

// Email configuration - Updated to Moil branding
const FROM_EMAIL = process.env.FROM_EMAIL || 'Moil Partners <partners@moilapp.com>';

// ============================================
// EMAIL QUEUE FOR RATE LIMITING
// ============================================

// Email queue for rate limiting (2 requests per second for Resend)
class EmailQueue {
  private queue: Array<{
    task: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  }> = [];
  private processing = false;
  private readonly delayMs: number;
  private lastRequestTime = 0;

  constructor(requestsPerSecond: number = 2) {
    this.delayMs = 1000 / requestsPerSecond;
  }

  async add<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        task: task as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });

      if (!this.processing) {
        this.processQueue();
      }
    }) as Promise<T>;
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (item) {
        // Calculate wait time to respect rate limit
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        const waitTime = Math.max(0, this.delayMs - timeSinceLastRequest);
        
        if (waitTime > 0) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        try {
          this.lastRequestTime = Date.now();
          const result = await item.task();
          item.resolve(result);
        } catch (error) {
          item.reject(error);
        }
      }
    }

    this.processing = false;
  }

  get pendingCount(): number {
    return this.queue.length;
  }
}

// Singleton email queue instance (2 requests per second for Resend rate limit)
const emailQueue = new EmailQueue(2);

// ============================================
// INTERFACES
// ============================================

export interface EdcEmailInfo {
  programName: string;
  fullName: string;
  logo?: string;
  logoInitial: string;
  primaryColor: string;
  supportEmail: string;
  licenseDuration: string;
  jobPosts?: number;
}

export interface LicenseActivationData {
  email: string;
  activationUrl: string;
  adminName: string;
  adminEmail?: string; // Used to determine which EDC the admin belongs to
  edc?: EdcEmailInfo; // Optional: pass EDC info directly
}

export interface TeamInvitationData {
  email: string;
  inviterName: string;
  teamName: string;
  teamId: string;
  inviteUrl: string;
  signupUrl: string;
  role: string;
  edc?: EdcEmailInfo;
}


/**
 * Convert a PartnerEdc to EdcEmailInfo for email templates
 */
function edcToEmailInfo(edc: PartnerEdc): EdcEmailInfo {
  return {
    programName: edc.programName,
    fullName: edc.fullName,
    logo: edc.branding?.logoUrl || edc.logo || getLogoUrl(),
    logoInitial: edc.branding?.logoInitial || edc.logoInitial || edc.name.charAt(0),
    primaryColor: edc.branding?.primaryColor || edc.primaryColor || '#6366F1',
    supportEmail: edc.supportEmail,
    licenseDuration: edc.licenseDuration,
    jobPosts: edc.features.jobPosts,
  };
}

/**
 * Get partner brand info from database by partner ID
 * Note: This function uses dynamic import for client-side Supabase to avoid issues in server contexts
 */
export async function getPartnerEmailInfoFromDb(partnerId: string): Promise<EdcEmailInfo | null> {
  try {
    const { createClient } = await import('./supabase/client');
    const supabase = createClient();
    
    const { data: partner, error } = await supabase
      .from('partners')
      .select('program_name, full_name, logo_url, logo_initial, primary_color, support_email, license_duration, features')
      .eq('id', partnerId)
      .single();
    
    if (error || !partner) {
      console.error('Error fetching partner for email:', error);
      return null;
    }
    
    return {
      programName: partner.program_name,
      fullName: partner.full_name,
      logo: partner.logo_url || undefined, // Don't default to Moil logo - let email template use logoInitial fallback
      logoInitial: partner.logo_initial,
      primaryColor: partner.primary_color,
      supportEmail: partner.support_email,
      licenseDuration: partner.license_duration,
      jobPosts: partner.features?.jobPosts,
    };
  } catch (error) {
    console.error('Error in getPartnerEmailInfoFromDb:', error);
    return null;
  }
}

/**
 * Get EDC info for email based on admin email or provided EDC
 */
function getEdcInfoForEmail(adminEmail?: string, providedEdc?: EdcEmailInfo): EdcEmailInfo {
  if (providedEdc) {
    return providedEdc;
  }
  
  if (adminEmail) {
    const edc = getEdcByEmail(adminEmail);
    if (edc) {
      return edcToEmailInfo(edc);
    }
  }
  
  // Default to Moil branding
  return edcToEmailInfo(getDefaultEdc());
}

export async function sendLicenseActivationEmail(data: LicenseActivationData) {
  try {
    if (!process.env.RESEND_API) {
      throw new Error('RESEND_API environment variable is not configured.');
    }

    // Get EDC info for this email
    const edcInfo = getEdcInfoForEmail(data.adminEmail, data.edc);

    // Use queue to respect rate limits
    const result = await emailQueue.add(async () => {
      return resend.emails.send({
        from: FROM_EMAIL,
        to: data.email,
        subject: `Welcome to ${edcInfo.programName}! 🎉`,
        react: LicenseActivationEmail({
          email: data.email,
          activationUrl: data.activationUrl,
          adminName: data.adminName,
          edc: edcInfo,
        }),
      });
    });

    if (result.error) {
      console.error('Resend API error:', result.error);
      return { success: false, error: result.error.message };
    }

    console.log('License activation email sent:', result.data?.id);
    return { success: true, messageId: result.data?.id };
  } catch (error) {
    console.error('Error sending license activation email:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function sendTeamInvitationEmail(data: TeamInvitationData) {
  try {
    if (!process.env.RESEND_API) {
      throw new Error('RESEND_API environment variable is not configured.');
    }

    // Get EDC info for this email
    const edcInfo = getEdcInfoForEmail(data.email, data.edc);

    // Use queue to respect rate limits
    const result = await emailQueue.add(async () => {
      return resend.emails.send({
        from: FROM_EMAIL,
        to: data.email,
        subject: `You've been invited to join ${data.teamName} on ${edcInfo.programName}! 🤝`,
        react: TeamInvitationEmail({
          email: data.email,
          inviterName: data.inviterName,
          teamName: data.teamName,
          teamId: data.teamId,
          inviteUrl: data.inviteUrl,
          signupUrl: data.signupUrl,
          role: data.role,
          edc: edcInfo,
        }),
      });
    });

    if (result.error) {
      console.error('Resend API error:', result.error);
      return { success: false, error: result.error.message };
    }

    console.log('Team invitation email sent:', result.data?.id);
    return { success: true, messageId: result.data?.id };
  } catch (error) {
    console.error('Error sending team invitation email:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export interface BatchLicenseActivationData {
  licenses: Array<{
    email: string;
    activationUrl: string;
    licenseId: string;
  }>;
  adminName: string;
  adminEmail?: string;
  edc?: EdcEmailInfo;
}

export async function sendBatchLicenseActivationEmails(data: BatchLicenseActivationData) {
  try {
    if (!process.env.RESEND_API) {
      throw new Error('RESEND_API environment variable is not configured.');
    }

    if (data.licenses.length === 0) {
      return { success: true, results: [], sent: 0, failed: 0 };
    }

    // Get EDC info for this batch
    const edcInfo = getEdcInfoForEmail(data.adminEmail, data.edc);

    // Use Resend's batch.send API (max 100 emails per batch)
    const batchSize = 100;

    // Process in batches
    const batches = data.licenses.reduce<typeof data.licenses[]>((acc, license, index) => {
      const batchIndex = Math.floor(index / batchSize);
      if (!acc[batchIndex]) acc[batchIndex] = [];
      acc[batchIndex].push(license);
      return acc;
    }, []);

    console.log(`Processing ${data.licenses.length} emails in ${batches.length} batches`);

    // Process batches sequentially through the queue to respect rate limits
    const allResults: Array<{
      email: string;
      licenseId: string;
      success: boolean;
      messageId?: string;
      error?: string;
    }> = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`Processing batch ${i + 1}/${batches.length} (${batch.length} emails)`);

      // Queue the batch send request
      const batchResult = await emailQueue.add(async () => {
        try {
          // Prepare batch email data
          const batchEmails = batch.map(license => ({
            from: FROM_EMAIL,
            to: [license.email],
            subject: `Welcome to ${edcInfo.programName}! 🎉`,
            react: LicenseActivationEmail({
              email: license.email,
              activationUrl: license.activationUrl,
              adminName: data.adminName,
              edc: edcInfo,
            }),
          }));

          // Send batch
          const result = await resend.batch.send(batchEmails);
          
          console.log(`Batch ${i + 1} response:`, result.error ? 'Error' : 'Success');

          if (result.error) {
            console.error('Batch send error:', result.error);
            return batch.map(license => ({
              email: license.email,
              licenseId: license.licenseId,
              success: false as const,
              error: result.error?.message || 'Batch send failed',
            }));
          }

          // Map successful results back to licenses
          const responseData = result.data as unknown as { data: Array<{ id: string }> };
          const batchData = responseData?.data || [];
          
          return batch.map((license, index) => {
            const emailResult = batchData[index];
            const messageId = emailResult?.id;
            
            return {
              email: license.email,
              licenseId: license.licenseId,
              success: true as const,
              messageId: messageId,
            };
          });
        } catch (error) {
          console.error(`Batch ${i + 1} error:`, error);
          return batch.map(license => ({
            email: license.email,
            licenseId: license.licenseId,
            success: false as const,
            error: error instanceof Error ? error.message : 'Unknown error',
          }));
        }
      });

      allResults.push(...batchResult);
    }

    const sent = allResults.filter(r => r.success).length;
    const failed = allResults.filter(r => !r.success).length;

    console.log(`Batch email sending complete: ${sent} sent, ${failed} failed`);
    return { success: true, results: allResults, sent, failed };
  } catch (error) {
    console.error('Error sending batch license activation emails:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      results: [],
      sent: 0,
      failed: data.licenses.length
    };
  }
}

export async function getEmailDeliveryStatus(messageId: string) {
  try {
    if (!process.env.RESEND_API) {
      throw new Error('RESEND_API environment variable is not configured.');
    }

    const email = await resend.emails.get(messageId);
    
    if (email.error) {
      return { success: false, error: email.error.message, status: 'unknown' };
    }

    // Get status from last_event field
    const status = email.data?.last_event || 'sent';
    return { 
      success: true, 
      status: status as string,
      data: email.data
    };
  } catch (error) {
    console.error('Error getting email delivery status:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 'unknown'
    };
  }
}

export async function getBatchEmailStatuses(messageIds: string[]) {
  try {
    if (!process.env.RESEND_API) {
      throw new Error('RESEND_API environment variable is not configured.');
    }

    // Fetch status for each message ID using the shared email queue
    const statusPromises = messageIds.map(async (messageId) => {
      return emailQueue.add(async () => {
        try {
          const email = await resend.emails.get(messageId);
          console.log(`Fetched status for ${messageId}:`, email.data?.last_event);
          if (email.error) {
            return { messageId, status: 'unknown' };
          }
          return { 
            messageId, 
            status: email.data?.last_event || 'sent' 
          };
        } catch (error) {
          console.error(`Error fetching status for ${messageId}:`, error);
          return { messageId, status: 'unknown' };
        }
      });
    });

    const results = await Promise.all(statusPromises);
    
    // Create a map of messageId to status
    const statusMap: Record<string, string> = {};
    results.forEach(({ messageId, status }) => {
      statusMap[messageId] = status;
    });

    return { 
      success: true, 
      statuses: statusMap
    };
  } catch (error) {
    console.error('Error getting batch email statuses:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      statuses: {}
    };
  }
}

// ============================================
// PARTNER ACCESS REQUEST EMAIL
// ============================================

// Moil admin emails to notify for partner access requests
const MOIL_ADMIN_EMAILS = [
  'taiwo@moilapp.com',
  'andres@moilapp.com',
  'jacob@moilapp.com',
  'steve@moilapp.com'
];

export interface PartnerAccessRequestData {
  organizationName: string;
  domain: string;
  requesterEmail: string;
  requestedAt?: string;
  approvalUrl?: string;
}

export async function sendPartnerAccessRequestEmail(data: PartnerAccessRequestData) {
  try {
    if (!process.env.RESEND_API) {
      throw new Error('RESEND_API environment variable is not configured.');
    }

    const baseUrl = getBaseUrl();
    const dashboardUrl = `${baseUrl}/moil-admin`;

    const requestedAt = data.requestedAt || new Date().toISOString();

    // Send email to all Moil admins using queue to respect rate limits
    const result = await emailQueue.add(async () => {
      return resend.emails.send({
        from: FROM_EMAIL,
        to: MOIL_ADMIN_EMAILS,
        subject: `🔔 New Partner Access Request: ${data.organizationName}`,
        react: PartnerAccessRequestEmail({
          organizationName: data.organizationName,
          domain: data.domain,
          requesterEmail: data.requesterEmail,
          requestedAt: requestedAt,
          dashboardUrl: dashboardUrl,
          approvalUrl: data.approvalUrl,
        }),
      });
    });

    if (result.error) {
      console.error('Resend API error:', result.error);
      return { success: false, error: result.error.message };
    }

    console.log('Partner access request email sent to Moil admins:', result.data?.id);
    return { success: true, messageId: result.data?.id };
  } catch (error) {
    console.error('Error sending partner access request email:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================
// PARTNER APPROVAL EMAIL
// ============================================

export interface PartnerApprovedData {
  organizationName: string;
  adminEmail: string;
}

export async function sendPartnerApprovedEmail(data: PartnerApprovedData) {
  try {
    if (!process.env.RESEND_API) {
      throw new Error('RESEND_API environment variable is not configured.');
    }

    const baseUrl = getBaseUrl();
    const loginUrl = `${baseUrl}/login`;
    const dashboardUrl = `${baseUrl}/admin/dashboard`;

    // Send email to the partner admin using queue to respect rate limits
    const result = await emailQueue.add(async () => {
      return resend.emails.send({
        from: FROM_EMAIL,
        to: data.adminEmail,
        subject: `🎉 Your Partner Account Has Been Approved!`,
        react: PartnerApprovedEmail({
          organizationName: data.organizationName,
          adminEmail: data.adminEmail,
          loginUrl: loginUrl,
          dashboardUrl: dashboardUrl,
        }),
      });
    });

    if (result.error) {
      console.error('Resend API error:', result.error);
      return { success: false, error: result.error.message };
    }

    console.log('Partner approval email sent to:', data.adminEmail, result.data?.id);
    return { success: true, messageId: result.data?.id };
  } catch (error) {
    console.error('Error sending partner approval email:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================
// PARTNER SIGNUP INVITE EMAIL
// ============================================

export interface PartnerSignupInviteData {
  email: string;
  partnerName: string;
  signupLink: string;
}

export async function sendPartnerSignupInviteEmail(data: PartnerSignupInviteData) {
  try {
    if (!process.env.RESEND_API) {
      throw new Error('RESEND_API environment variable is not configured.');
    }

    const { PartnerSignupInviteEmail } = await import('../emails/partner-signup-invite');

    const result = await emailQueue.add(() =>
      resend.emails.send({
        from: FROM_EMAIL,
        to: data.email,
        subject: `🚀 You're Invited to Join ${data.partnerName} on Moil Partners`,
        react: PartnerSignupInviteEmail({
          partnerName: data.partnerName,
          signupLink: data.signupLink,
        }),
      })
    );

    if (result.error) {
      console.error('Resend API error:', result.error);
      return { success: false, error: result.error.message };
    }

    console.log('Partner signup invite email sent to:', data.email, result.data?.id);
    return { success: true, messageId: result.data?.id };
  } catch (error) {
    console.error('Error sending partner signup invite email:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
