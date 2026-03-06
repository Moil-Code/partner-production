import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Button,
  Hr,
} from '@react-email/components';
import * as React from 'react';

interface PartnerAccessRequestEmailProps {
  organizationName: string;
  domain: string;
  requesterEmail: string;
  requestedAt: string;
  dashboardUrl: string;
  approvalUrl?: string;
}

export const PartnerAccessRequestEmail = ({
  organizationName = 'Acme Corporation',
  domain = 'acme.com',
  requesterEmail = 'admin@acme.com',
  requestedAt = new Date().toISOString(),
  dashboardUrl = 'https://partners.moilapp.com/moil-admin',
  approvalUrl,
}: PartnerAccessRequestEmailProps) => {
  const previewText = `New Partner Access Request: ${organizationName}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Img
              src="https://moilapp.com/logo.png"
              width="120"
              height="40"
              alt="Moil"
              style={logo}
            />
          </Section>

          {/* Main Content */}
          <Section style={content}>
            <Heading style={h1}>🔔 New Partner Access Request</Heading>
            
            <Text style={paragraph}>
              A new organization has requested access to the Moil Partners platform.
            </Text>

            {/* Request Details Card */}
            <Section style={detailsCard}>
              <Text style={detailsTitle}>Request Details</Text>
              
              <Section style={detailRow}>
                <Text style={detailLabel}>Organization</Text>
                <Text style={detailValue}>{organizationName}</Text>
              </Section>
              
              <Section style={detailRow}>
                <Text style={detailLabel}>Domain</Text>
                <Text style={detailValueCode}>{domain}</Text>
              </Section>
              
              <Section style={detailRow}>
                <Text style={detailLabel}>Requester Email</Text>
                <Text style={detailValue}>{requesterEmail}</Text>
              </Section>
              
              <Section style={detailRow}>
                <Text style={detailLabel}>Requested At</Text>
                <Text style={detailValue}>
                  {new Date(requestedAt).toLocaleString('en-US', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </Text>
              </Section>
            </Section>

            {approvalUrl ? (
              <>
                <Text style={paragraph}>
                  Click the button below to instantly approve this partner request:
                </Text>

                {/* Direct Approval Button */}
                <Section style={buttonContainer}>
                  <Button style={approveButton} href={approvalUrl}>
                    ✓ Approve Partner
                  </Button>
                </Section>

                <Hr style={hr} />

                <Text style={footerNote}>
                  Clicking the button above will immediately activate <strong>{organizationName}</strong> as a partner.
                  Users from <strong>{domain}</strong> will then be able to sign in and create teams.
                </Text>

                <Text style={altLinkText}>
                  Or review in the <Link href={dashboardUrl} style={link}>Moil Admin Dashboard</Link>
                </Text>
              </>
            ) : (
              <>
                <Text style={paragraph}>
                  Please review this request and take appropriate action in the Moil Admin Dashboard.
                </Text>

                {/* CTA Button */}
                <Section style={buttonContainer}>
                  <Button style={button} href={dashboardUrl}>
                    Review in Dashboard
                  </Button>
                </Section>

                <Hr style={hr} />

                <Text style={footerNote}>
                  You can approve or reject this request from the Moil Admin Dashboard. 
                  Once approved, users from <strong>{domain}</strong> will be able to 
                  sign in and create teams.
                </Text>
              </>
            )}
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              This is an automated notification from Moil Partners.
            </Text>
            <Text style={footerText}>
              © {new Date().getFullYear()} Moil. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default PartnerAccessRequestEmail;

// Styles
const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '0',
  marginBottom: '64px',
  borderRadius: '12px',
  overflow: 'hidden' as const,
  maxWidth: '600px',
};

const header = {
  backgroundColor: '#5843BE',
  padding: '32px 40px',
  textAlign: 'center' as const,
};

const logo = {
  margin: '0 auto',
};

const content = {
  padding: '40px',
};

const h1 = {
  color: '#0F172A',
  fontSize: '24px',
  fontWeight: '700',
  margin: '0 0 24px',
  padding: '0',
  lineHeight: '1.3',
};

const paragraph = {
  color: '#334155',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 24px',
};

const detailsCard = {
  backgroundColor: '#F8FAFC',
  borderRadius: '8px',
  padding: '24px',
  marginBottom: '24px',
  border: '1px solid #E2E8F0',
};

const detailsTitle = {
  color: '#0F172A',
  fontSize: '14px',
  fontWeight: '600',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  margin: '0 0 16px',
};

const detailRow = {
  marginBottom: '12px',
};

const detailLabel = {
  color: '#64748B',
  fontSize: '13px',
  fontWeight: '500',
  margin: '0 0 4px',
};

const detailValue = {
  color: '#0F172A',
  fontSize: '15px',
  fontWeight: '600',
  margin: '0',
};

const detailValueCode = {
  color: '#5843BE',
  fontSize: '15px',
  fontWeight: '600',
  fontFamily: 'monospace',
  backgroundColor: '#EDE9FE',
  padding: '4px 8px',
  borderRadius: '4px',
  display: 'inline-block' as const,
  margin: '0',
};

const buttonContainer = {
  textAlign: 'center' as const,
  marginBottom: '24px',
};

const button = {
  backgroundColor: '#5843BE',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block' as const,
  padding: '14px 32px',
};

const approveButton = {
  backgroundColor: '#16A34A',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block' as const,
  padding: '14px 32px',
};

const altLinkText = {
  color: '#64748B',
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '16px 0 0',
  textAlign: 'center' as const,
};

const link = {
  color: '#5843BE',
  textDecoration: 'underline',
};

const hr = {
  borderColor: '#E2E8F0',
  margin: '24px 0',
};

const footerNote = {
  color: '#64748B',
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '0',
};

const footer = {
  backgroundColor: '#F8FAFC',
  padding: '24px 40px',
  textAlign: 'center' as const,
};

const footerText = {
  color: '#94A3B8',
  fontSize: '12px',
  lineHeight: '1.5',
  margin: '0 0 8px',
};
