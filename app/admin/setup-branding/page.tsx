'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast/use-toast';
import Logo from '@/components/ui/Logo';
import { ColorPicker } from '@/components/ui/color-picker';
import { 
  Palette,
  Image as ImageIcon,
  Save,
  Upload,
  Trash2,
  Eye,
  ArrowRight
} from 'lucide-react';

interface Partner {
  id: string;
  name: string;
  domain: string;
  primary_color: string;
  secondary_color: string;
  logo_url: string;
  logo_initial: string;
}

export default function SetupBrandingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [partner, setPartner] = useState<Partner | null>(null);
  
  const [formData, setFormData] = useState({
    primary_color: '#6366F1',
    secondary_color: '#8B5CF6',
    logo_url: '',
    logo_initial: '',
  });

  useEffect(() => {
    checkAuthAndFetchPartner();
  }, []);

  const checkAuthAndFetchPartner = async () => {
    try {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        router.push('/login');
        return;
      }

      const { data: admin, error: adminError } = await supabase
        .from('admins')
        .select('partner_id, global_role')
        .eq('id', user.id)
        .single();

      if (adminError || !admin) {
        router.push('/login');
        return;
      }

      // Moil admins don't need branding setup
      if (admin.global_role === 'moil_admin') {
        router.push('/moil-admin/dashboard');
        return;
      }

      if (!admin.partner_id) {
        router.push('/login');
        return;
      }

      const { data: partnerData, error: partnerError } = await supabase
        .from('partners')
        .select('*')
        .eq('id', admin.partner_id)
        .single();

      if (partnerError || !partnerData) {
        router.push('/login');
        return;
      }

      // If branding is already set, redirect to dashboard
      if (partnerData.primary_color && partnerData.primary_color !== '#6366F1') {
        router.push('/admin/dashboard');
        return;
      }

      setPartner(partnerData);
      setFormData({
        primary_color: partnerData.primary_color || '#6366F1',
        secondary_color: partnerData.secondary_color || '#8B5CF6',
        logo_url: partnerData.logo_url || '',
        logo_initial: partnerData.logo_initial || partnerData.name?.charAt(0) || '',
      });
    } catch (error) {
      console.error('Error:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !partner) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file',
        description: 'Please upload an image file',
        type: 'error',
      });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please upload an image smaller than 2MB',
        type: 'error',
      });
      return;
    }

    setUploading(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);
      formDataUpload.append('partnerId', partner.id);

      const response = await fetch('/api/upload/logo', {
        method: 'POST',
        body: formDataUpload,
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setFormData(prev => ({ ...prev, logo_url: data.url }));
      toast({
        title: 'Logo uploaded',
        description: 'Your logo has been uploaded successfully',
        type: 'success',
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload failed',
        description: 'Failed to upload logo. Please try again.',
        type: 'error',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!partner) return;

    setSaving(true);
    try {
      const supabase = createClient();

      const { error } = await supabase
        .from('partners')
        .update({
          primary_color: formData.primary_color,
          secondary_color: formData.secondary_color,
          logo_url: formData.logo_url,
          logo_initial: formData.logo_initial,
        })
        .eq('id', partner.id);

      if (error) throw error;

      toast({
        title: 'Branding saved!',
        description: 'Your brand identity has been set up successfully.',
        type: 'success',
      });

      router.push('/admin/dashboard');
    } catch (error) {
      console.error('Save error:', error);
      toast({
        title: 'Save failed',
        description: 'Failed to save branding. Please try again.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    router.push('/admin/dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" variant="primary" className="mx-auto" />
          <p className="mt-4 text-[var(--text-secondary)]">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] font-sans text-[var(--text-primary)]">
      <div className="container mx-auto px-6 py-12 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <Logo size="lg" className="mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
            Set Up Your Brand Identity
          </h1>
          <p className="text-[var(--text-secondary)]">
            Customize how your organization appears to your team members
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Form */}
          <div className="space-y-6">
            {/* Logo Upload */}
            <Card variant="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="w-5 h-5" />
                  Organization Logo
                </CardTitle>
                <CardDescription>Upload your company logo (optional)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <div 
                    className="w-20 h-20 rounded-xl flex items-center justify-center overflow-hidden border-2 border-dashed border-[var(--border)]"
                    style={{ 
                      background: formData.logo_url 
                        ? 'white' 
                        : `linear-gradient(135deg, ${formData.primary_color}, ${formData.secondary_color})`
                    }}
                  >
                    {formData.logo_url ? (
                      <img 
                        src={formData.logo_url} 
                        alt="Logo" 
                        className="w-full h-full object-contain p-2"
                      />
                    ) : (
                      <span className="text-3xl font-bold text-white">
                        {formData.logo_initial || partner?.name?.charAt(0) || 'P'}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="w-full"
                    >
                      {uploading ? (
                        <Spinner size="sm" className="mr-2" />
                      ) : (
                        <Upload className="w-4 h-4 mr-2" />
                      )}
                      {uploading ? 'Uploading...' : 'Upload Logo'}
                    </Button>
                    {formData.logo_url && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setFormData(prev => ({ ...prev, logo_url: '' }))}
                        className="w-full text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Remove Logo
                      </Button>
                    )}
                  </div>
                </div>

                {!formData.logo_url && (
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                      Logo Initial (if no logo)
                    </label>
                    <input
                      type="text"
                      value={formData.logo_initial}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        logo_initial: e.target.value.charAt(0).toUpperCase() 
                      }))}
                      maxLength={1}
                      className="w-20 px-4 py-3 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] text-center text-2xl font-bold"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Brand Colors */}
            <Card variant="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="w-5 h-5" />
                  Brand Colors
                </CardTitle>
                <CardDescription>Choose your organization's colors</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                    Primary Color
                  </label>
                  <ColorPicker
                    value={formData.primary_color}
                    onChange={(color) => setFormData(prev => ({ ...prev, primary_color: color }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                    Secondary Color
                  </label>
                  <ColorPicker
                    value={formData.secondary_color}
                    onChange={(color) => setFormData(prev => ({ ...prev, secondary_color: color }))}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Preview */}
          <div>
            <Card variant="glass" className="sticky top-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="w-5 h-5" />
                  Preview
                </CardTitle>
                <CardDescription>See how your branding looks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-6 bg-white rounded-xl border-2 border-[var(--border)] shadow-sm">
                  <div className="flex items-center gap-4 mb-4">
                    <div 
                      className="w-16 h-16 rounded-xl flex items-center justify-center overflow-hidden shadow-md"
                      style={{ 
                        background: `linear-gradient(135deg, ${formData.primary_color}, ${formData.secondary_color})`
                      }}
                    >
                      {formData.logo_url ? (
                        <img 
                          src={formData.logo_url} 
                          alt="Logo" 
                          className="w-full h-full object-contain p-2"
                        />
                      ) : (
                        <span className="text-2xl font-bold text-white">
                          {formData.logo_initial || partner?.name?.charAt(0) || 'P'}
                        </span>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 
                        className="text-lg font-bold"
                        style={{ color: formData.primary_color }}
                      >
                        {partner?.name || 'Organization Name'}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {partner?.domain || 'domain.com'}
                      </p>
                    </div>
                  </div>

                  <div 
                    className="p-4 rounded-lg border"
                    style={{ 
                      borderColor: formData.primary_color + '30',
                      backgroundColor: formData.primary_color + '05'
                    }}
                  >
                    <h4 
                      className="font-semibold mb-2"
                      style={{ color: formData.primary_color }}
                    >
                      Welcome to {partner?.name || 'Your Organization'}
                    </h4>
                    <p className="text-sm text-gray-700 mb-3">
                      This is how your branding will appear throughout the platform.
                    </p>
                    <button
                      className="w-full py-2.5 px-4 rounded-lg text-white font-medium shadow-sm"
                      style={{ 
                        background: `linear-gradient(135deg, ${formData.primary_color}, ${formData.secondary_color})`
                      }}
                    >
                      Get Started
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-3">
                    Brand Colors
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <div 
                        className="h-12 rounded-lg shadow-sm"
                        style={{ backgroundColor: formData.primary_color }}
                      />
                      <p className="text-xs text-[var(--text-tertiary)] text-center">Primary</p>
                    </div>
                    <div className="space-y-2">
                      <div 
                        className="h-12 rounded-lg shadow-sm"
                        style={{ backgroundColor: formData.secondary_color }}
                      />
                      <p className="text-xs text-[var(--text-tertiary)] text-center">Secondary</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-8 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={handleSkip}
          >
            Skip for now
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="min-w-[200px]"
          >
            {saving ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save & Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
