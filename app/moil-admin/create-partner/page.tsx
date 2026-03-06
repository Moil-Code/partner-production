'use client';

import React, { useState, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast/use-toast';
import Logo from '@/components/ui/Logo';
import { ColorPicker } from '@/components/ui/color-picker';
import { ArrowLeft, Building2, Mail, Palette, Upload, X, ImageIcon, User, CheckCircle, Copy, Link, Send } from 'lucide-react';

export default function CreatePartnerPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [partnerName, setPartnerName] = useState('');
  const [domain, setDomain] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#6366F1');
  const [secondaryColor, setSecondaryColor] = useState('#8B5CF6');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoPreview, setLogoPreview] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [createdData, setCreatedData] = useState<{
    partner: any;
    signupLink: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [adminEmail, setAdminEmail] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);


  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) {
      toast({
        title: 'Invalid File Type',
        description: 'Please upload a JPG, PNG, GIF, WebP, or SVG image',
        type: 'error',
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File Too Large',
        description: 'Logo must be less than 5MB',
        type: 'error',
      });
      return;
    }

    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview('');
    setLogoUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };


  const handleCreatePartner = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!partnerName.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Partner name is required',
        type: 'error',
      });
      return;
    }

    if (!domain.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Invalid domain format (e.g., company.com)',
        type: 'error',
      });
      return;
    }

    // Validate domain format
    const domainRegex = /^[a-z0-9][a-z0-9\.-]*\.[a-z]{2,}$/i;
    if (!domainRegex.test(domain)) {
      toast({
        title: 'Validation Error',
        description: 'Invalid domain format (e.g., company.com)',
        type: 'error',
      });
      return;
    }

    setLoading(true);

    try {
      let uploadedLogoUrl = '';

      // Upload logo if selected
      if (logoFile) {
        setUploadingLogo(true);
        const formData = new FormData();
        formData.append('file', logoFile);
        formData.append('partnerName', partnerName.trim());

        const uploadResponse = await fetch('/api/upload/logo', {
          method: 'POST',
          body: formData,
        });

        const uploadData = await uploadResponse.json();
        
        if (!uploadResponse.ok) {
          console.error('Logo upload failed:', uploadData.error);
        } else {
          uploadedLogoUrl = uploadData.url;
        }
        setUploadingLogo(false);
      }

      // Create partner via API
      const response = await fetch('/api/partners/create-with-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnerName: partnerName.trim(),
          domain: domain.toLowerCase().trim(),
          primaryColor,
          secondaryColor,
          logoUrl: uploadedLogoUrl || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create partner');
      }

      setCreatedData({
        partner: data.partner,
        signupLink: `${window.location.origin}${data.signupLink}`,
      });

      toast({
        title: 'Success',
        description: `Partner "${partnerName}" created successfully`,
        type: 'success',
      });
    } catch (error) {
      console.error('Error creating partner:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create partner',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: 'Link copied to clipboard',
      type: 'success',
    });
  };

  const handleSendEmail = async () => {
    if (!adminEmail || !createdData) return;

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(adminEmail)) {
      toast({
        title: 'Invalid Email',
        description: 'Please enter a valid email address',
        type: 'error',
      });
      return;
    }

    // Extract domain from admin email
    const emailDomain = adminEmail.split('@')[1]?.toLowerCase();
    if(emailDomain !== createdData.partner.domain.toLowerCase()) {
      toast({
        title: 'Invalid Email Domain',
        description: `Admin email must be from the partner domain (@${createdData.partner.domain})`,
        type: 'error',
      });
      return;
    }

    setSendingEmail(true);
    try {
      const response = await fetch('/api/email/partner-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: adminEmail,
          partnerName: createdData.partner.name,
          signupLink: createdData.signupLink,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send email');
      }

      toast({
        title: 'Email Sent',
        description: `Signup link sent to ${adminEmail}`,
        type: 'success',
      });
      setAdminEmail('');
    } catch (error) {
      console.error('Error sending email:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to send email',
        type: 'error',
      });
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] font-sans text-[var(--text-primary)]">
      {/* Header */}
      <header className="glass-panel border-b border-[var(--border)] sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Logo size="sm" showText={false} />
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)]">Create New Partner</h1>
              <p className="text-sm text-[var(--text-secondary)]">Add a new partner organization</p>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8 max-w-2xl">
        <Button
          variant="ghost"
          onClick={() => router.push('/moil-admin/dashboard')}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>

        {/* Success View */}
        {createdData ? (
          <Card variant="glass" className="border-l-4 border-l-[var(--accent)]">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-[var(--accent)]" />
                </div>
                <div>
                  <CardTitle className="text-[var(--text-primary)]">Partner Created Successfully!</CardTitle>
                  <CardDescription>
                    Share the signup link with the partner admin to complete their account setup
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-[var(--surface-subtle)] rounded-xl">
                  <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Partner</p>
                  <p className="font-semibold text-[var(--text-primary)]">{createdData.partner.name}</p>
                  <p className="text-sm text-[var(--text-secondary)] font-mono">{createdData.partner.domain}</p>
                </div>
                <div className="p-4 bg-[var(--surface-subtle)] rounded-xl">
                  <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Domain</p>
                  <p className="font-semibold text-[var(--text-primary)] font-mono">{createdData.partner.domain}</p>
                  <p className="text-sm text-[var(--text-secondary)]">Partner domain</p>
                </div>
              </div>

              {/* Signup Link */}
              <div className="p-4 bg-[var(--primary)]/5 rounded-xl border border-[var(--primary)]/20">
                <div className="flex items-center gap-2 mb-2">
                  <Link className="w-4 h-4 text-[var(--primary)]" />
                  <p className="text-sm font-medium text-[var(--text-primary)]">Partner Signup Link</p>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mb-3">
                  Share this link with the partner admin to create their account. Their account will be automatically linked to this partner.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={createdData.signupLink}
                    readOnly
                    className="flex-1 px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm font-mono text-[var(--text-secondary)] truncate"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(createdData.signupLink)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Send Email to Admin */}
              <div className="p-4 bg-[var(--secondary)]/5 rounded-xl border border-[var(--secondary)]/20">
                <div className="flex items-center gap-2 mb-2">
                  <Send className="w-4 h-4 text-[var(--secondary)]" />
                  <p className="text-sm font-medium text-[var(--text-primary)]">Send Signup Link via Email</p>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mb-3">
                  Enter the partner admin's email address to send them the signup link directly.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="admin@partner.com"
                    className="flex-1 px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleSendEmail}
                    disabled={!adminEmail || sendingEmail || !adminEmail.includes(createdData?.partner.domain)}
                    loading={sendingEmail}
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Send
                  </Button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 justify-end pt-4 border-t border-[var(--border)]">
                <Button
                  variant="outline"
                  onClick={() => {
                    setCreatedData(null);
                    setPartnerName('');
                    setDomain('');
                    setLogoPreview('');
                    setLogoFile(null);
                  }}
                >
                  Create Another
                </Button>
                <Button onClick={() => router.push('/moil-admin/dashboard')}>
                  Back to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
        <Card variant="glass">
          <CardHeader>
            <CardTitle className="text-[var(--text-primary)]">Partner Information</CardTitle>
            <CardDescription>
              Enter the partner details to create their organization
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreatePartner} className="space-y-6">
              {/* Partner Name */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                  <Building2 className="w-4 h-4 inline mr-2" />
                  Partner/Organization Name *
                </label>
                <input
                  type="text"
                  value={partnerName}
                  onChange={(e) => setPartnerName(e.target.value)}
                  placeholder="e.g., Queen Creek Chamber"
                  className="w-full px-4 py-3 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all text-[var(--text-primary)]"
                  required
                />
                <p className="text-xs text-[var(--text-tertiary)] mt-2">
                  This name will be used for the partner and their default team
                </p>
              </div>

              {/* Domain */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                  <Mail className="w-4 h-4 inline mr-2" />
                  Partner Domain *
                </label>
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value.toLowerCase())}
                  placeholder="queencreekchamber.com"
                  className="w-full px-4 py-3 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all text-[var(--text-primary)] font-mono"
                  required
                />
                <p className="text-xs text-[var(--text-tertiary)] mt-2">
                  Enter the organization's email domain (e.g., company.com)
                </p>
              </div>

              {/* Partner Logo */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                  <ImageIcon className="w-4 h-4 inline mr-2" />
                  Partner Logo
                </label>
                <div className="flex items-start gap-4">
                  {/* Logo Preview */}
                  <div className="w-24 h-24 rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-subtle)] flex items-center justify-center overflow-hidden">
                    {logoPreview ? (
                      <div className="relative w-full h-full">
                        <Image
                          src={logoPreview}
                          alt="Logo preview"
                          fill
                          className="object-contain p-2"
                        />
                      </div>
                    ) : (
                      <div className="text-center">
                        <ImageIcon className="w-8 h-8 text-[var(--text-tertiary)] mx-auto" />
                        <p className="text-xs text-[var(--text-tertiary)] mt-1">No logo</p>
                      </div>
                    )}
                  </div>
                  
                  {/* Upload Controls */}
                  <div className="flex-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                      onChange={handleLogoSelect}
                      className="hidden"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={loading}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        {logoPreview ? 'Change Logo' : 'Upload Logo'}
                      </Button>
                      {logoPreview && (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={removeLogo}
                          disabled={loading}
                          className="text-[var(--error)]"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)] mt-2">
                      JPG, PNG, GIF, WebP, or SVG. Max 5MB.
                    </p>
                  </div>
                </div>
              </div>

              {/* Brand Colors */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-3">
                  <Palette className="w-4 h-4 inline mr-2" />
                  Brand Colors
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <ColorPicker
                    value={primaryColor}
                    onChange={setPrimaryColor}
                    label="Primary Color"
                    disabled={loading}
                  />
                  <ColorPicker
                    value={secondaryColor}
                    onChange={setSecondaryColor}
                    label="Secondary Color"
                    disabled={loading}
                  />
                </div>
                <p className="text-xs text-[var(--text-tertiary)] mt-3">
                  Partners can customize these colors later in their settings
                </p>
              </div>

              {/* Submit Button */}
              <div className="flex gap-3 justify-end pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/moil-admin/dashboard')}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={loading}
                  disabled={loading}
                >
                  Create Partner
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        )}
      </div>
    </div>
  );
}
