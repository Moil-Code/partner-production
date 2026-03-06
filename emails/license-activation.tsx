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
  licenseDuration: string;
  jobPosts?: number;
}

interface LicenseActivationEmailProps {
  email: string;
  activationUrl: string;
  adminName: string;
  edc?: EdcInfo;
}

// Default EDC info (Moil Partners)
// Note: logo URL is now dynamically set by the email.ts utility
const defaultEdc: EdcInfo = {
  programName: 'Moil Partners',
  fullName: 'Moil',
  logoInitial: 'M',
  primaryColor: '#6366F1',
  supportEmail: 'cs@moilapp.com',
  licenseDuration: '1 year',
  jobPosts: 3,
};

export const LicenseActivationEmail = ({
  email,
  activationUrl,
  adminName,
  edc = defaultEdc,
}: LicenseActivationEmailProps) => {
  const edcInfo = { ...defaultEdc, ...edc };
  
  // Dynamic styles based on EDC colors
  // Use white shade for header to ensure good contrast with all logo colors
  const dynamicHeader = {
    ...header,
    backgroundColor: '#f8fafc',
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
      <Head>
        <Font
          fontFamily="Work Sans"
          fallbackFontFamily="sans-serif"
          webFont={{
            url: "https://fonts.gstatic.com/s/worksans/v19/QGYsz_wNahGAdqQ43Rh_fKDp.woff2",
            format: "woff2",
          }}
          fontWeight={400}
          fontStyle="normal"
        />
        <Font
          fontFamily="Work Sans"
          fallbackFontFamily="sans-serif"
          webFont={{
            url: "https://fonts.gstatic.com/s/worksans/v19/QGYsz_wNahGAdqQ43Rh_fKDp.woff2",
            format: "woff2",
          }}
          fontWeight={600}
          fontStyle="normal"
        />
        <Font
          fontFamily="Work Sans"
          fallbackFontFamily="sans-serif"
          webFont={{
            url: "https://fonts.gstatic.com/s/worksans/v19/QGYsz_wNahGAdqQ43Rh_fKDp.woff2",
            format: "woff2",
          }}
          fontWeight={700}
          fontStyle="normal"
        />
      </Head>
      <Preview>Welcome to {edcInfo.programName} 🎉</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
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

          {/* Main Content */}
          <Section style={content}>
            <Heading style={h1}>Welcome to {edcInfo.programName}! 🎉</Heading>
            
            <Text style={text}>
              You're officially in — and we're excited to have you.
            </Text>

            <Text style={text}>
              Thanks to the {edcInfo.fullName} and the {edcInfo.programName} program, 
              you've been granted a <strong>FREE {edcInfo.licenseDuration} license</strong> to 
              Moil's AI-powered Business Coach.
            </Text>

            <Section style={highlightBox}>
              <Text style={highlightText}>
                Moil is your on-demand AI business partner — available 24/7 — designed specifically to help you build, grow, and run your business with confidence.
              </Text>
            </Section>

            {/* What Moil Helps You Achieve */}
            <Section style={stepsContainer}>
              <Heading style={h2}>🚀 What You Can Achieve</Heading>
              <Text style={stepText}>
                With your {edcInfo.programName} license, you can:
              </Text>
              <table style={listTable} cellPadding="0" cellSpacing="0">
                <tr>
                  <td style={bulletCell}>•</td>
                  <td style={textCell}>Turn ideas into a clear, actionable business plan</td>
                </tr>
                <tr>
                  <td style={bulletCell}>•</td>
                  <td style={textCell}>Generate market research from just 21 simple questions</td>
                </tr>
                <tr>
                  <td style={bulletCell}>•</td>
                  <td style={textCell}>Get help with marketing, pricing, and growth</td>
                </tr>
                <tr>
                  <td style={bulletCell}>•</td>
                  <td style={textCell}>Create strategies, content, and action plans — fast</td>
                </tr>
              </table>
            </Section>

            <Text style={text}>
              You can ask real questions like:
            </Text>
            <Section style={questionBox}>
              <Text style={questionText}>"What should I focus on right now?"</Text>
              <Text style={questionText}>"Am I charging enough?"</Text>
              <Text style={questionText}>"How do I get more customers?"</Text>
            </Section>

            {/* CTA Button */}
            <Section style={buttonContainer}>
              <Button style={dynamicButton} href={activationUrl}>
                Activate Your Account
              </Button>
            </Section>

            <Text style={linkText}>
              Or copy this URL: <Link href={activationUrl} style={dynamicLink}>{activationUrl}</Link>
            </Text>

            {/* Next Steps */}
            <Section style={nextStepsContainer}>
              <Heading style={h2}>🧭 Getting Started (5 Minutes)</Heading>
              <table width="100%" cellPadding="0" cellSpacing="0" border={0}>
                <tr>
                  <td style={stepNumberCell}>
                    <div style={stepNumber}>1</div>
                  </td>
                  <td style={stepContentCell}>
                    <Text style={stepContent}>Click the activation link above</Text>
                  </td>
                </tr>
                <tr>
                  <td style={stepNumberCell}>
                    <div style={stepNumber}>2</div>
                  </td>
                  <td style={stepContentCell}>
                    <Text style={stepContent}>Verify your email & Sign in as <strong>{email}</strong></Text>
                  </td>
                </tr>
                <tr>
                  <td style={stepNumberCell}>
                    <div style={stepNumber}>3</div>
                  </td>
                  <td style={stepContentCell}>
                    <Text style={stepContent}>Complete your business profile</Text>
                  </td>
                </tr>
                <tr>
                  <td style={stepNumberCell}>
                    <div style={stepNumber}>4</div>
                  </td>
                  <td style={stepContentCell}>
                    <Text style={stepContent}>Start chatting with your AI Business Coach</Text>
                  </td>
                </tr>
              </table>
            </Section>

            {/* Features */}
            <Section style={featuresContainer}>
              <Heading style={h2}>🎁 Your License Includes</Heading>
              <Text style={featureText}>✨ 24/7 AI Business Coach</Text>
              <Text style={featureText}>📊 Market research & business insights</Text>
              <Text style={featureText}>💡 Personalized growth guidance</Text>
              <Text style={featureText}>🎯 Goal tracking & accountability</Text>
              {edcInfo.jobPosts && edcInfo.jobPosts > 0 && (
                <Text style={featureText}>📣 {edcInfo.jobPosts} job posts per month</Text>
              )}
              <Text style={featureText}>📚 Templates & resources</Text>
            </Section>

            <Text style={text}>
              If you have any questions, our support team is here for you at{' '}
              <Link href={`mailto:${edcInfo.supportEmail}`} style={dynamicLink}>
                {edcInfo.supportEmail}
              </Link>
            </Text>

            <Text style={closingText}>
              Welcome — we're excited to build with you. 💪
            </Text>
            <Text style={signatureText}>
              The {edcInfo.fullName} & Moil Team
            </Text>
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Powered by Moil • Sponsored by {edcInfo.fullName}
            </Text>
            <Text style={footerText}>
              This email was sent to {email} because a license was assigned to you.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default LicenseActivationEmail;

// Styles
const main = {
  backgroundColor: '#f3f4f6',
  fontFamily: '"Work Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '40px auto',
  padding: '0',
  borderRadius: '16px',
  overflow: 'hidden',
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  maxWidth: '600px',
  border: '1px solid #e5e7eb',
};

const header = {
  backgroundColor: '#f8fafc', // Light white shade for better contrast with all logo colors
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

const logoText = {
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: '#ffffff',
  margin: '0',
  letterSpacing: '-0.025em',
  textAlign: 'center' as const,
};

const content = {
  padding: '40px',
};

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

const stepText = {
  color: '#4b5563',
  fontSize: '15px',
  lineHeight: '1.6',
  margin: '0 0 12px',
};

const listTable = {
  width: '100%',
};

const bulletCell = {
  verticalAlign: 'top',
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

const questionBox = {
  backgroundColor: '#f9fafb',
  borderRadius: '12px',
  padding: '20px',
  margin: '16px 0 32px',
  border: '1px solid #f3f4f6',
};

const questionText = {
  color: '#374151',
  fontSize: '15px',
  fontStyle: 'italic',
  lineHeight: '1.6',
  margin: '0 0 8px',
  paddingLeft: '16px',
  borderLeft: '2px solid #9ca3af',
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
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
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

const nextStepsContainer = {
  backgroundColor: '#eff6ff',
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

const closingText = {
  color: '#1f2937',
  fontSize: '16px',
  fontWeight: '600',
  lineHeight: '1.6',
  margin: '32px 0 8px',
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
