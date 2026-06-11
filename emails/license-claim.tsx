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

interface LicenseClaimEmailProps {
  email: string;
  loginUrl: string;
  partnerName: string;
  edc?: EdcInfo;
}

const defaultEdc: EdcInfo = {
  programName: 'Moil Partners',
  fullName: 'Moil',
  logoInitial: 'M',
  primaryColor: '#6366F1',
  supportEmail: 'cs@moilapp.com',
};

export const LicenseClaimEmail = ({
  email,
  loginUrl,
  partnerName,
  edc = defaultEdc,
}: LicenseClaimEmailProps) => {
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
      <Preview>You&apos;ve been assigned a license by {partnerName} — claim it now</Preview>
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
            <Heading style={h1}>A license has been assigned to you 🎉</Heading>

            <Text style={text}>
              <strong>{partnerName}</strong> has assigned you a Moil license through the{' '}
              <strong>{edcInfo.programName}</strong> program.
            </Text>

            <Section style={highlightBox}>
              <Text style={highlightText}>
                You already have a Moil account. All you need to do is log in and complete your
                employer profile to activate your license and start using Moil&apos;s AI-powered
                Business Coach.
              </Text>
            </Section>

            {/* Steps */}
            <Section style={stepsContainer}>
              <Heading style={h2}>Claim your license in 2 steps</Heading>
              <table width="100%" cellPadding="0" cellSpacing="0" border={0}>
                <tr>
                  <td style={stepNumberCell}>
                    <div style={stepNumber}>1</div>
                  </td>
                  <td style={stepContentCell}>
                    <Text style={stepContent}>
                      Log in with your existing Moil account at <strong>{email}</strong>
                    </Text>
                  </td>
                </tr>
                <tr>
                  <td style={stepNumberCell}>
                    <div style={stepNumber}>2</div>
                  </td>
                  <td style={stepContentCell}>
                    <Text style={stepContent}>
                      Complete your employer profile — your license will activate automatically
                    </Text>
                  </td>
                </tr>
              </table>
            </Section>

            {/* CTA */}
            <Section style={buttonContainer}>
              <Button style={dynamicButton} href={loginUrl}>
                Log In &amp; Create Profile
              </Button>
            </Section>

            <Text style={linkText}>
              Or copy this link:{' '}
              <Link href={loginUrl} style={dynamicLink}>
                {loginUrl}
              </Link>
            </Text>

            <Text style={text}>
              If you have any questions, reach out to us at{' '}
              <Link href={`mailto:${edcInfo.supportEmail}`} style={dynamicLink}>
                {edcInfo.supportEmail}
              </Link>
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

export default LicenseClaimEmail;

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

const stepsContainer = {
  backgroundColor: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  padding: '24px',
  margin: '32px 0',
};

const stepNumberCell = {
  width: '36px',
  verticalAlign: 'top' as const,
  paddingRight: '12px',
  paddingBottom: '12px',
};

const stepNumber = {
  backgroundColor: '#3b82f6',
  color: '#ffffff',
  width: '24px',
  height: '24px',
  borderRadius: '50%',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  lineHeight: '24px',
  textAlign: 'center' as const,
};

const stepContentCell = {
  verticalAlign: 'top' as const,
  paddingBottom: '12px',
};

const stepContent = {
  margin: '0',
  fontSize: '15px',
  color: '#1f2937',
  lineHeight: '1.5',
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
  margin: '0 0 16px',
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
