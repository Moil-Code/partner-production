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

interface PartnerSignupInviteEmailProps {
  partnerName: string;
  signupLink: string;
}

export const PartnerSignupInviteEmail = ({
  partnerName = 'Acme Corporation',
  signupLink = 'https://partners.moilapp.com/signup?partnerId=xxx',
}: PartnerSignupInviteEmailProps) => {
  const previewText = `You've been invited to join ${partnerName} on Moil Partners`;

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
            <Heading style={h1}>🚀 You're Invited to Join Moil Partners!</Heading>
            
            <Text style={paragraph}>
              You've been invited to become the admin for <strong>{partnerName}</strong> on the Moil Partners platform.
            </Text>

            <Text style={paragraph}>
              As a partner admin, you'll be able to:
            </Text>

            <Section style={featureList}>
              <Text style={featureItem}>✓ Manage your organization's business licenses</Text>
              <Text style={featureItem}>✓ Create and manage teams</Text>
              <Text style={featureItem}>✓ Invite team members</Text>
              <Text style={featureItem}>✓ Customize your white-label branding</Text>
            </Section>

            <Text style={paragraph}>
              Click the button below to create your admin account:
            </Text>

            {/* CTA Button */}
            <Section style={buttonContainer}>
              <Button style={button} href={signupLink}>
                Create Your Account
              </Button>
            </Section>

            <Text style={smallText}>
              Or copy and paste this link into your browser:
            </Text>
            <Text style={linkText}>
              <Link href={signupLink} style={link}>
                {signupLink}
              </Link>
            </Text>

            <Hr style={hr} />

            <Text style={paragraph}>
              <strong>Important:</strong> Please use an email address with your organization's domain to complete the signup process.
            </Text>
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              This invitation was sent by the Moil team. If you didn't expect this email, you can safely ignore it.
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

export default PartnerSignupInviteEmail;

// Styles
const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  maxWidth: '600px',
};

const header = {
  padding: '32px 48px 24px',
  textAlign: 'center' as const,
};

const logo = {
  margin: '0 auto',
};

const content = {
  padding: '0 48px',
};

const h1 = {
  color: '#1a1a1a',
  fontSize: '24px',
  fontWeight: '600',
  lineHeight: '32px',
  margin: '0 0 24px',
  textAlign: 'center' as const,
};

const paragraph = {
  color: '#525f7f',
  fontSize: '16px',
  lineHeight: '24px',
  margin: '0 0 16px',
};

const featureList = {
  backgroundColor: '#f8fafc',
  borderRadius: '8px',
  padding: '16px 24px',
  margin: '0 0 24px',
};

const featureItem = {
  color: '#525f7f',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '0',
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const button = {
  backgroundColor: '#6366f1',
  borderRadius: '8px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 32px',
};

const smallText = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  margin: '0 0 8px',
  textAlign: 'center' as const,
};

const linkText = {
  textAlign: 'center' as const,
  margin: '0 0 24px',
};

const link = {
  color: '#6366f1',
  fontSize: '12px',
  wordBreak: 'break-all' as const,
};

const hr = {
  borderColor: '#e6ebf1',
  margin: '32px 0',
};

const footer = {
  padding: '0 48px',
};

const footerText = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  margin: '0 0 8px',
  textAlign: 'center' as const,
};
