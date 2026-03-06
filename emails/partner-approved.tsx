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

interface PartnerApprovedEmailProps {
  organizationName: string;
  adminEmail: string;
  loginUrl: string;
  dashboardUrl: string;
}

export const PartnerApprovedEmail = ({
  organizationName = 'Acme Corporation',
  adminEmail = 'admin@acme.com',
  loginUrl = 'https://partners.moilapp.com/login',
  dashboardUrl = 'https://partners.moilapp.com/admin/dashboard',
}: PartnerApprovedEmailProps) => {
  const previewText = `Your partner account has been approved!`;

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
            <Heading style={h1}>🎉 Your Partner Account is Approved!</Heading>
            
            <Text style={paragraph}>
              Great news! Your partner organization <strong>{organizationName}</strong> has been approved by the Moil team.
            </Text>

            <Text style={paragraph}>
              You can now access the Moil Partners platform and start managing your business licenses, teams, and white-label branding.
            </Text>

            {/* Account Details Card */}
            <Section style={detailsCard}>
              <Text style={detailsTitle}>Your Account Details</Text>
              
              <Section style={detailRow}>
                <Text style={detailLabel}>Organization</Text>
                <Text style={detailValue}>{organizationName}</Text>
              </Section>
              
              <Section style={detailRow}>
                <Text style={detailLabel}>Admin Email</Text>
                <Text style={detailValue}>{adminEmail}</Text>
              </Section>
            </Section>

            <Text style={paragraph}>
              Click the button below to sign in and get started:
            </Text>

            {/* CTA Button */}
            <Section style={buttonContainer}>
              <Button style={button} href={loginUrl}>
                Sign In to Dashboard
              </Button>
            </Section>

            <Hr style={hr} />

            <Text style={h2}>What's Next?</Text>

            <Section style={stepsList}>
              <Text style={stepItem}>
                <strong>1. Set Up Your Branding</strong> - Customize your logo, colors, and program name
              </Text>
              <Text style={stepItem}>
                <strong>2. Create Your First Team</strong> - Invite team members and manage licenses
              </Text>
              <Text style={stepItem}>
                <strong>3. Manage Licenses</strong> - Distribute and track business licenses for your organization
              </Text>
            </Section>

            <Hr style={hr} />

            <Text style={footerNote}>
              If you have any questions or need assistance getting started, please don't hesitate to reach out to our support team.
            </Text>

            <Text style={altLinkText}>
              Or visit your <Link href={dashboardUrl} style={link}>Partner Dashboard</Link> directly
            </Text>
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Welcome to the Moil Partners platform!
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

export default PartnerApprovedEmail;

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

const h2 = {
  color: '#0F172A',
  fontSize: '20px',
  fontWeight: '600',
  margin: '24px 0 16px',
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

const stepsList = {
  margin: '16px 0',
};

const stepItem = {
  color: '#334155',
  fontSize: '15px',
  lineHeight: '1.8',
  margin: '0 0 12px',
  paddingLeft: '8px',
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
  margin: '0 0 16px',
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
