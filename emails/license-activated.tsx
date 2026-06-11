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
  Font,
} from '@react-email/components';
import * as React from 'react';

interface EdcInfo {
  programName: string;
  fullName: string;
  logoInitial: string;
  logo?: string;
  primaryColor: string;
  supportEmail: string;
}

interface LicenseActivatedEmailProps {
  email: string;
  loginUrl: string;
  partnerName: string;
  planName: string;
  edc?: EdcInfo;
}

const defaultEdc: EdcInfo = {
  programName: 'Moil Partners',
  fullName: 'Moil',
  logoInitial: 'M',
  primaryColor: '#6366F1',
  supportEmail: 'cs@moilapp.com',
};

export const LicenseActivatedEmail = ({
  email,
  loginUrl,
  partnerName,
  planName,
  edc = defaultEdc,
}: LicenseActivatedEmailProps) => {
  const edcInfo = { ...defaultEdc, ...edc };

  const dynamicButton = { ...button, backgroundColor: edcInfo.primaryColor };
  const dynamicLink = { ...link, color: edcInfo.primaryColor };

  return (
    <Html>
      <Head>
        <Font
          fontFamily="Work Sans"
          fallbackFontFamily="sans-serif"
          webFont={{
            url: 'https://fonts.gstatic.com/s/worksans/v19/QGYsz_wNahGAdqQ43Rh_fKDp.woff2',
            format: 'woff2',
          }}
          fontWeight={400}
          fontStyle="normal"
        />
        <Font
          fontFamily="Work Sans"
          fallbackFontFamily="sans-serif"
          webFont={{
            url: 'https://fonts.gstatic.com/s/worksans/v19/QGYsz_wNahGAdqQ43Rh_fKDp.woff2',
            format: 'woff2',
          }}
          fontWeight={600}
          fontStyle="normal"
        />
      </Head>
      <Preview>Your {planName} license from {partnerName} is now active ✅</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <table width="100%" cellPadding="0" cellSpacing="0" border={0}>
              <tr>
                <td align="center" style={{ padding: '0' }}>
                  {edcInfo.logo ? (
                    <img src={edcInfo.logo} alt={edcInfo.programName} style={logoImage} />
                  ) : (
                    <div style={logoFallback}>{edcInfo.logoInitial}</div>
                  )}
                </td>
              </tr>
            </table>
          </Section>

          {/* Main Content */}
          <Section style={content}>
            <Heading style={h1}>Your license is active! ✅</Heading>

            <Text style={text}>
              <strong>{partnerName}</strong> has given you a Moil license through the{' '}
              <strong>{edcInfo.programName}</strong> program, and it is already active on your
              account.
            </Text>

            {/* Plan Badge */}
            <Section style={planBadge}>
              <Text style={planLabel}>Your Plan</Text>
              <Text style={planName_style}>{planName}</Text>
              <Text style={planSubtext}>via {edcInfo.programName}</Text>
            </Section>

            <Section style={highlightBox}>
              <Text style={highlightText}>
                Your subscription has been upgraded — no action required. Simply log in to your
                Moil account to access all features included in your plan.
              </Text>
            </Section>

            {/* Features */}
            <Section style={featuresContainer}>
              <Heading style={h2}>🎁 What&apos;s included</Heading>
              <Text style={featureText}>✨ 24/7 AI Business Coach</Text>
              <Text style={featureText}>📊 Market research &amp; business insights</Text>
              <Text style={featureText}>💡 Personalized growth guidance</Text>
              <Text style={featureText}>🎯 Goal tracking &amp; accountability</Text>
              <Text style={featureText}>📣 Job posting credits</Text>
              <Text style={featureText}>📚 Templates &amp; resources</Text>
            </Section>

            {/* CTA */}
            <Section style={buttonContainer}>
              <Button style={dynamicButton} href={loginUrl}>
                Go to My Dashboard
              </Button>
            </Section>

            <Text style={linkText}>
              Or copy this link:{' '}
              <Link href={loginUrl} style={dynamicLink}>
                {loginUrl}
              </Link>
            </Text>

            <Text style={text}>
              Questions? Reach us at{' '}
              <Link href={`mailto:${edcInfo.supportEmail}`} style={dynamicLink}>
                {edcInfo.supportEmail}
              </Link>
            </Text>

            <Text style={signatureText}>
              Welcome — we&apos;re excited to build with you. 💪
            </Text>
            <Text style={signatureText}>The {edcInfo.fullName} &amp; Moil Team</Text>
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>Powered by Moil • Sponsored by {edcInfo.fullName}</Text>
            <Text style={footerText}>
              This email was sent to {email} because a license was assigned to your account.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default LicenseActivatedEmail;

const main = {
  backgroundColor: '#f3f4f6',
  fontFamily:
    '"Work Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '40px auto',
  padding: '0',
  borderRadius: '16px',
  overflow: 'hidden',
  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
  maxWidth: '600px',
  border: '1px solid #e5e7eb',
};

const header = {
  backgroundColor: '#f8fafc',
  padding: '40px 0',
  textAlign: 'center' as const,
};

const logoImage = {
  width: '80px',
  height: 'auto',
  display: 'block',
  margin: '0 auto 12px',
};

const logoFallback = {
  width: '48px',
  height: '48px',
  borderRadius: '12px',
  background: 'linear-gradient(135deg, #ffffff 0%, #e0e7ff 100%)',
  color: '#1e40af',
  fontSize: '24px',
  fontWeight: 'bold' as const,
  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
  lineHeight: '48px',
  textAlign: 'center' as const,
  margin: '0 auto 12px',
};

const content = { padding: '40px' };

const h1 = {
  color: '#111827',
  fontSize: '28px',
  fontWeight: '700',
  margin: '0 0 24px',
  textAlign: 'center' as const,
  lineHeight: '1.2',
  letterSpacing: '-0.025em',
};

const h2 = {
  color: '#1f2937',
  fontSize: '18px',
  fontWeight: '600',
  margin: '0 0 16px',
  lineHeight: '1.4',
};

const text = {
  color: '#4b5563',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 16px',
};

const planBadge = {
  backgroundColor: '#f0fdf4',
  border: '1px solid #bbf7d0',
  borderRadius: '12px',
  padding: '20px',
  margin: '24px 0',
  textAlign: 'center' as const,
};

const planLabel = {
  color: '#6b7280',
  fontSize: '12px',
  fontWeight: '600',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  margin: '0 0 4px',
};

const planName_style = {
  color: '#166534',
  fontSize: '22px',
  fontWeight: '700',
  margin: '0 0 4px',
};

const planSubtext = {
  color: '#6b7280',
  fontSize: '13px',
  margin: '0',
};

const highlightBox = {
  backgroundColor: '#eff6ff',
  borderRadius: '12px',
  padding: '20px',
  margin: '24px 0',
  borderLeft: '4px solid #3b82f6',
};

const highlightText = {
  color: '#1e3a8a',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0',
  fontWeight: '500',
};

const featuresContainer = {
  backgroundColor: '#f0fdf4',
  border: '1px solid #bbf7d0',
  borderRadius: '12px',
  padding: '24px',
  margin: '32px 0',
};

const featureText = {
  color: '#166534',
  fontSize: '15px',
  lineHeight: '1.6',
  margin: '0 0 8px',
  fontWeight: '500',
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
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '16px 40px',
  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
};

const linkText = {
  color: '#6b7280',
  fontSize: '13px',
  lineHeight: '1.5',
  margin: '0 0 32px',
  textAlign: 'center' as const,
  wordBreak: 'break-all' as const,
};

const link = {
  color: '#1e40af',
  textDecoration: 'underline',
  fontWeight: '500',
};

const signatureText = {
  color: '#4b5563',
  fontSize: '15px',
  lineHeight: '1.6',
  margin: '0 0 8px',
};

const footer = {
  backgroundColor: '#f9fafb',
  padding: '32px 40px',
  borderTop: '1px solid #e5e7eb',
  textAlign: 'center' as const,
};

const footerText = {
  color: '#9ca3af',
  fontSize: '12px',
  lineHeight: '1.5',
  margin: '0 0 8px',
};
