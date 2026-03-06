import React, { useState, useRef } from 'react';
import { Plus, Upload, X, Mail, FileDown } from 'lucide-react';
import { useToast } from '@/components/ui/toast/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

interface AddLicenseFormProps {
  availableLicenses: number;
  onLicensesAdded: () => void;
}

export function AddLicenseForm({ availableLicenses, onLicensesAdded }: AddLicenseFormProps) {
  const { toast } = useToast();
  const [newEmail, setNewEmail] = useState('');
  const [emailTags, setEmailTags] = useState<string[]>([]);
  const [addingLicense, setAddingLicense] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleEmailInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Check if user typed a comma
    if (value.includes(',')) {
      const parts = value.split(',');
      const emailsToAdd = parts.slice(0, -1).map(email => email.trim()).filter(email => email);
      const currentInput = parts[parts.length - 1].trim();
      
      // Add valid emails as tags (avoid duplicates)
      const validEmails = emailsToAdd.filter(email => 
        email.includes('@') && 
        email.length > 0 && 
        !emailTags.includes(email)
      );
      
      if (validEmails.length > 0) {
        setEmailTags(prev => [...prev, ...validEmails]);
      }
      
      // Clear the input or keep the text after the last comma
      setNewEmail(currentInput);
    } else {
      setNewEmail(value);
    }
  };

  const handleEmailInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newEmail.trim()) {
      e.preventDefault();
      const email = newEmail.trim();
      if (email.includes('@') && !emailTags.includes(email)) {
        setEmailTags(prev => [...prev, email]);
        setNewEmail('');
      }
    } else if (e.key === 'Backspace' && !newEmail && emailTags.length > 0) {
      // Remove last tag if backspace is pressed on empty input
      setEmailTags(prev => prev.slice(0, -1));
    }
  };

  const removeEmailTag = (emailToRemove: string) => {
    setEmailTags(prev => prev.filter(email => email !== emailToRemove));
  };

  const handleAddLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingLicense(true);

    try {
      // Combine email tags with current input
      const allEmails = [...emailTags];
      if (newEmail.trim()) {
        allEmails.push(newEmail.trim());
      }

      if (allEmails.length === 0) {
        toast({
          title: "Input Required",
          description: "Please enter at least one email address",
          type: "warning"
        });
        setAddingLicense(false);
        return;
      }

      if (allEmails.length > availableLicenses) {
        toast({
          title: "Insufficient Licenses",
          description: `You are trying to add ${allEmails.length} licenses but only have ${availableLicenses} available.`,
          type: "error"
        });
        setAddingLicense(false);
        return;
      }

      // Use single or multiple license API based on count
      const endpoint = allEmails.length === 1 ? '/api/licenses/add' : '/api/licenses/add-multiple';
      const body = allEmails.length === 1 
        ? { email: allEmails[0] }
        : { emails: allEmails };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add license(s)');
      }

      if (allEmails.length === 1) {
        toast({
          title: "Success",
          description: "License added successfully!",
          type: "success"
        });
      } else {
        const successCount = data.results?.success || 0;
        const errorCount = data.results?.errors?.length || 0;
        
        if (errorCount > 0) {
          toast({
            title: "Partial Success",
            description: `${successCount} license(s) added. ${errorCount} failed.`,
            type: "warning"
          });
        } else {
          toast({
            title: "Success",
            description: `${successCount} license(s) added successfully!`,
            type: "success"
          });
        }
      }

      setNewEmail('');
      setEmailTags([]);
      onLicensesAdded();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || 'An error occurred',
        type: "error"
      });
    } finally {
      setAddingLicense(false);
    }
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (availableLicenses === 0) {
      toast({
        title: "No Licenses Available",
        description: "Please purchase more licenses before importing.",
        type: "error"
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setImporting(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/licenses/import', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to import CSV');
      }

      toast({
        title: "Import Successful",
        description: data.message,
        type: "success"
      });
      
      onLicensesAdded();
    } catch (err: any) {
      toast({
        title: "Import Failed",
        description: err.message || 'An error occurred during import',
        type: "error"
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Card variant="glass" className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-center gap-2 mb-1">
          <div className="p-2 bg-[var(--primary)]/10 rounded-lg text-[var(--primary)]">
            <Mail className="w-5 h-5" />
          </div>
          <CardTitle className="text-xl">Add New License</CardTitle>
        </div>
        <CardDescription>
          Enter email addresses separated by commas to create multiple licenses. 
          {availableLicenses === 0 && (
            <span className="block mt-2 text-red-600 font-medium bg-red-50 p-2 rounded-lg border border-red-100">
              ⚠️ No available licenses. Please purchase more licenses first.
            </span>
          )}
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <form onSubmit={handleAddLicense} className="space-y-4 mb-8">
          <div className="flex-1">
            {/* Email Tags Display */}
            {emailTags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3 p-3 bg-[var(--surface-subtle)] rounded-xl border border-[var(--border)] animate-in fade-in slide-in-from-top-2">
                {emailTags.map((email, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-[var(--primary)] text-white text-sm rounded-full shadow-sm"
                  >
                    {email}
                    <button
                      type="button"
                      onClick={() => removeEmailTag(email)}
                      className="ml-1 hover:bg-white/20 rounded-full p-0.5 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            
            <div className="flex flex-col gap-3">
              <input 
                type="text" 
                value={newEmail}
                onChange={handleEmailInputChange}
                onKeyDown={handleEmailInputKeyDown}
                className="w-full px-4 py-3 border border-[var(--border)] rounded-xl text-[var(--text-primary)] placeholder-[var(--text-tertiary)] bg-[var(--surface)] focus:border-[var(--primary)] focus:outline-none focus:ring-4 focus:ring-[var(--primary)]/10 transition-all duration-300 disabled:bg-[var(--surface-subtle)] disabled:cursor-not-allowed shadow-sm"
                placeholder="Enter email addresses..."
                disabled={addingLicense || availableLicenses === 0}
              />
              <Button 
                type="submit" 
                disabled={addingLicense || availableLicenses === 0 || (emailTags.length === 0 && !newEmail.trim())}
                size="lg"
                className="w-full whitespace-nowrap h-auto py-3 px-6"
                loading={addingLicense}
              >
                {!addingLicense && <Plus className="w-5 h-5 mr-2" />}
                {addingLicense ? 'Adding...' : `Add License${emailTags.length > 0 || (newEmail.includes(',')) ? 's' : ''}`}
              </Button>
            </div>
          </div>
          
          {/* Helper Text */}
          <div className="text-sm text-[var(--text-secondary)] flex items-center justify-between flex-wrap gap-2">
            <span>
              💡 <strong className="font-semibold">Tip:</strong> Press Enter or Comma after each email.
            </span>
            {emailTags.length > 0 && (
              <span className="text-[var(--primary)] font-medium bg-[var(--primary)]/5 px-2 py-1 rounded-md border border-[var(--primary)]/10">
                {emailTags.length} email{emailTags.length > 1 ? 's' : ''} ready to add
              </span>
            )}
          </div>
        </form>

        {/* CSV Upload */}
        <div className="relative group">
          <div className="absolute inset-0 bg-[var(--primary)]/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
          <div className="relative flex flex-col gap-4 p-5 bg-[var(--surface-subtle)]/50 border-2 border-dashed border-[var(--border)] rounded-xl group-hover:border-[var(--primary)]/30 transition-colors duration-300">
            <input 
              type="file" 
              id="csv-file"
              ref={fileInputRef}
              accept=".csv"
              onChange={handleCsvImport}
              className="hidden"
              disabled={availableLicenses === 0 || importing}
            />
            <div className="flex flex-wrap items-center gap-3">
              <label 
                htmlFor="csv-file"
                className={`flex-1 min-w-[140px] px-4 py-2.5 border border-[var(--border)] bg-[var(--surface)] rounded-lg font-medium text-[var(--text-secondary)] transition-all duration-300 flex items-center justify-center gap-2 shadow-sm ${
                  availableLicenses === 0 || importing
                    ? 'opacity-50 cursor-not-allowed' 
                    : 'cursor-pointer hover:border-[var(--primary)] hover:text-[var(--primary)] hover:shadow-md'
                }`}
              >
                <Upload className="w-4 h-4" />
                <span className="whitespace-nowrap">Choose CSV</span>
              </label>
              <a 
                href="/sample-licenses.csv"
                download="license-template.csv"
                className="flex-1 min-w-[120px] px-4 py-2.5 border border-[var(--border)] bg-transparent rounded-lg font-medium text-[var(--primary)] transition-all duration-300 flex items-center justify-center gap-2 hover:bg-[var(--primary)]/5 hover:border-[var(--primary)]/30"
                title="Download CSV template"
              >
                <FileDown className="w-4 h-4" />
                Template
              </a>
            </div>
            <div className="w-full">
              <span className="text-sm text-[var(--text-secondary)] block text-center">
                {importing ? 'Importing users...' : 'Upload multiple users via CSV'}
              </span>
            </div>
            {importing && (
               <div className="flex justify-center">
                 <Spinner size="sm" />
               </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
