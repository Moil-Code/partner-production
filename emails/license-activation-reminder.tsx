import {
  Body,
  Button,
  Container,
  Font,
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
  logo?: string;
  primaryColor: string;
  supportEmail: string;
  licenseDuration: string;
  jobPosts?: number;
}

interface LicenseActivationReminderEmailProps {
  email: string;
  activationUrl: string;
  daysSinceAssigned: number;
  reminderNumber: number;
  edc?: EdcInfo;
}

const defaultEdc: EdcInfo = {
  programName: 'Moil Partners',
  fullName: 'Moil',
  logoInitial: 'M',
  primaryColor: '#6366F1',
  supportEmail: 'cs@moilapp.com',
  licenseDuration: '1 year',
  jobPosts: 3,
};

export const LicenseActivationReminderEmail = ({
  email,
  activationUrl,
  daysSinceAssigned,
  reminderNumber,
  edc = defaultEdc,
}: LicenseActivationReminderEmailProps) => {
  const edcInfo = { ...defaultEdc, ...edc };

  const dynamicHeader = { ...header, backgroundColor: '#f8fafc' };
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
        <Font
          fontFamily="Work Sans"
          fallbackFontFamily="sans-serif"
          webFont={{
            url: 'https://fonts.gstatic.com/s/worksans/v19/QGYsz_wNahGAdqQ43Rh_fKDp.woff2',
            format: 'woff2',
          }}
          fontWeight={700}
          fontStyle="normal"
        />
      </Head>
      <Preview>
        Reminder: your {edcInfo.programName} license is still waiting
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={dynamicHeader}>
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

          <Section style={content}>
            <Heading style={h1}>You haven&apos;t activated your license yet</Heading>

            <Text style={text}>
              It&apos;s been {daysSinceAssigned} days since a free{' '}
              <strong>{edcInfo.licenseDuration} license</strong> to Moil&apos;s
              AI-powered Business Coach was assigned to you through{' '}
              {edcInfo.programName} — and it&apos;s still waiting for you.
            </Text>

            <Section style={highlightBox}>
              <Text style={highlightText}>
                Activation takes about a minute. Once you&apos;re in, Moil works
                as your on-demand AI business partner — 24/7 — to help you
                build, grow, and run your business.
              </Text>
            </Section>

            <Section style={buttonContainer}>
              <Button style={dynamicButton} href={activationUrl}>
                Activate Your License
              </Button>
            </Section>

            <Text style={linkText}>
              Or copy this URL:{' '}
              <Link href={activationUrl} style={dynamicLink}>
                {activationUrl}
              </Link>
            </Text>

            <Section style={stepsContainer}>
              <Heading style={h2}>What you&apos;re missing</Heading>
              <table style={listTable} cellPadding="0" cellSpacing="0">
                <tr>
                  <td style={bulletCell}>•</td>
                  <td style={textCell}>24/7 AI Business Coach</td>
                </tr>
                <tr>
                  <td style={bulletCell}>•</td>
                  <td style={textCell}>Market research from 21 simple questions</td>
                </tr>
                <tr>
                  <td style={bulletCell}>•</td>
                  <td style={textCell}>Marketing, pricing, and growth guidance</td>
                </tr>
                <tr>
                  <td style={bulletCell}>•</td>
                  <td style={textCell}>Personalized action plans, fast</td>
                </tr>
              </table>
            </Section>

            <Text style={text}>
              Questions or trouble activating? Reach our team at{' '}
              <Link href={`mailto:${edcInfo.supportEmail}`} style={dynamicLink}>
                {edcInfo.supportEmail}
              </Link>
              .
            </Text>

            <Text style={signatureText}>
              The {edcInfo.fullName} & Moil Team
            </Text>
          </Section>

          <Section style={footer}>
            <Text style={footerText}>
              Powered by Moil • Sponsored by {edcInfo.fullName}
            </Text>
            <Text style={footerText}>
              This is reminder #{reminderNumber} for the license assigned to{' '}
              {email}. You will receive at most 4 reminders.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default LicenseActivationReminderEmail;

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
  boxShadow:
    '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
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
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  lineHeight: '48px',
  textAlign: 'center' as const,
  margin: '0 auto 12px',
};

const content = {
  padding: '40px',
};

const h1 = {
  color: '#111827',
  fontSize: '26px',
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
  backgroundColor: '#f0f9ff',
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

const listTable = {
  width: '100%',
};

const bulletCell = {
  verticalAlign: 'top' as const,
  paddingRight: '12px',
  color: '#3b82f6',
  fontSize: '18px',
  lineHeight: '1.6',
};

const textCell = {
  color: '#4b5563',
  fontSize: '15px',
  lineHeight: '1.6',
  paddingBottom: '8px',
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
  boxShadow:
    '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
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
  margin: '24px 0 0',
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
