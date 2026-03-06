import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface EdcInfo {
  programName: string;
  fullName: string;
  logoInitial: string;
  primaryColor: string;
  supportEmail: string;
}

interface TeamInvitationEmailProps {
  email: string;
  inviterName: string;
  teamName: string;
  teamId: string;
  inviteUrl: string;
  signupUrl: string;
  role: string;
  edc?: EdcInfo;
}

// Default EDC info (Moil Partners)
const defaultEdc: EdcInfo = {
  programName: 'Moil Partners',
  fullName: 'Moil',
  logoInitial: 'M',
  primaryColor: '#6366F1',
  supportEmail: 'cs@moilapp.com',
};

export const TeamInvitationEmail = ({
  email,
  inviterName,
  teamName,
  teamId,
  inviteUrl,
  signupUrl,
  role,
  edc = defaultEdc,
}: TeamInvitationEmailProps) => {
  const edcInfo = { ...defaultEdc, ...edc };
  const roleDisplay = role === 'admin' ? 'an Admin' : 'a Team Member';
  
  // Dynamic styles based on EDC colors
  const dynamicHeader = {
    ...header,
    backgroundColor: edcInfo.primaryColor,
  };
  
  const dynamicButton = {
    ...button,
    backgroundColor: edcInfo.primaryColor,
  };
  
  const dynamicLink = {
    ...link,
    color: edcInfo.primaryColor,
  };
  
  return (
    <Html>
      <Head />
      <Preview>You've been invited to join {teamName} on {edcInfo.programName}! 🤝</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={dynamicHeader}>
            <div style={logoContainer}>
              <div style={logo}>{edcInfo.logoInitial}</div>
              <Text style={logoText}>{edcInfo.programName}</Text>
            </div>
          </Section>

          {/* Main Content */}
          <Section style={content}>
            <Heading style={h1}>You're Invited! 🤝</Heading>
            
            <Text style={text}>
              <strong>{inviterName}</strong> has invited you to join <strong>{teamName}</strong> as {roleDisplay} on {edcInfo.programName}.
            </Text>

            <Text style={text}>
              As a team member, you'll be able to collaborate on license management, help onboard new users, and contribute to your organization's success on the {edcInfo.programName} platform.
            </Text>

            {/* Team Badge */}
            <Section style={teamBadge}>
              <Text style={teamBadgeLabel}>You're joining:</Text>
              <Text style={teamBadgeName}>{teamName}</Text>
              <Text style={teamBadgeId}>Team ID: {teamId}</Text>
            </Section>

            {/* CTA Button */}
            <Section style={buttonContainer}>
              <Button style={dynamicButton} href={signupUrl}>
                Create Account & Join Team
              </Button>
            </Section>

            <Text style={text}>
              Or copy and paste this URL into your browser:
            </Text>
            <Text style={linkText}>
              <Link href={signupUrl} style={dynamicLink}>
                {signupUrl}
              </Link>
            </Text>

            <Text style={textSmall}>
              Already have an account?{' '}
              <Link href={inviteUrl} style={dynamicLink}>
                Click here to accept the invitation
              </Link>
            </Text>

            {/* What You Can Do */}
            <Section style={featuresContainer}>
              <Heading style={h2}>What You'll Be Able To Do:</Heading>
              <Text style={featureText}>📋 Manage and assign licenses to users</Text>
              <Text style={featureText}>📧 Send activation emails to new users</Text>
              <Text style={featureText}>📊 View license statistics and analytics</Text>
              {role === 'admin' && (
                <>
                  <Text style={featureText}>👥 Invite other team members</Text>
                  <Text style={featureText}>💳 Purchase additional licenses</Text>
                </>
              )}
            </Section>

            {/* Important Note */}
            <Section style={noteContainer}>
              <Text style={noteText}>
                <strong>Note:</strong> This invitation will expire in 7 days. If you don't have a {edcInfo.programName} account yet, you'll be prompted to create one when you accept this invitation.
              </Text>
            </Section>

            <Text style={text}>
              Questions? Contact the person who invited you or reach out to our support team at{' '}
              <Link href={`mailto:${edcInfo.supportEmail}`} style={dynamicLink}>
                {edcInfo.supportEmail}
              </Link>
            </Text>
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Powered by Moil • Sponsored by {edcInfo.fullName}
            </Text>
            <Text style={footerText}>
              This email was sent to {email} because you were invited to join a team on {edcInfo.programName}.
            </Text>
            <Text style={footerText}>
              If you didn't expect this invitation, you can safely ignore this email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default TeamInvitationEmail;

// Styles
const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '0',
  marginBottom: '64px',
  maxWidth: '600px',
};

const header = {
  backgroundColor: '#1e40af',
  padding: '32px 40px',
  textAlign: 'center' as const,
};

const logoContainer = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '12px',
};

const logo = {
  width: '48px',
  height: '48px',
  borderRadius: '12px',
  background: 'linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#ffffff',
  fontSize: '24px',
  fontWeight: 'bold',
};

const logoText = {
  fontSize: '24px',
  fontWeight: 'bold',
  color: '#ffffff',
  margin: '0',
};

const content = {
  padding: '40px',
};

const h1 = {
  color: '#1f2937',
  fontSize: '28px',
  fontWeight: 'bold',
  margin: '0 0 24px',
  lineHeight: '1.3',
};

const h2 = {
  color: '#1f2937',
  fontSize: '20px',
  fontWeight: 'bold',
  margin: '0 0 16px',
  lineHeight: '1.4',
};

const text = {
  color: '#4b5563',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 16px',
};

const textSmall = {
  color: '#6b7280',
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '16px 0',
  textAlign: 'center' as const,
};

const teamBadge = {
  backgroundColor: '#f0f9ff',
  border: '2px solid #0ea5e9',
  borderRadius: '12px',
  padding: '20px',
  margin: '24px 0',
  textAlign: 'center' as const,
};

const teamBadgeLabel = {
  color: '#6b7280',
  fontSize: '12px',
  fontWeight: '600',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  margin: '0 0 8px',
};

const teamBadgeName = {
  color: '#0c4a6e',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '0 0 4px',
};

const teamBadgeId = {
  color: '#64748b',
  fontSize: '12px',
  fontFamily: 'monospace',
  margin: '0',
};

const featureText = {
  color: '#4b5563',
  fontSize: '15px',
  lineHeight: '1.6',
  margin: '0 0 8px',
};

const buttonContainer = {
  margin: '32px 0',
  textAlign: 'center' as const,
};

const button = {
  backgroundColor: '#1e40af',
  borderRadius: '12px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '16px 32px',
};

const linkText = {
  color: '#6b7280',
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '0 0 24px',
  wordBreak: 'break-all' as const,
};

const link = {
  color: '#1e40af',
  textDecoration: 'underline',
};

const featuresContainer = {
  backgroundColor: '#eff6ff',
  border: '1px solid #bfdbfe',
  borderRadius: '12px',
  padding: '24px',
  margin: '24px 0',
};

const noteContainer = {
  backgroundColor: '#fef3c7',
  border: '1px solid #fcd34d',
  borderRadius: '12px',
  padding: '16px 24px',
  margin: '24px 0',
};

const noteText = {
  color: '#92400e',
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '0',
};

const footer = {
  backgroundColor: '#f9fafb',
  padding: '32px 40px',
  borderTop: '1px solid #e5e7eb',
};

const footerText = {
  color: '#6b7280',
  fontSize: '12px',
  lineHeight: '1.6',
  margin: '0 0 8px',
  textAlign: 'center' as const,
};
