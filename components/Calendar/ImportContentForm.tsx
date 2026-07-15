import React, { useRef, useState } from 'react';
import { Upload, FileDown, CalendarPlus } from 'lucide-react';
import { useToast } from '@/components/ui/toast/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { CONTENT_TYPE_LABELS, CONTENT_TYPES } from '@/lib/types/content';

interface ImportContentFormProps {
  onImported: () => void;
}

export function ImportContentForm({ onImported }: ImportContentFormProps) {
  const { toast } = useToast();
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/content/import', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to import content');
      }

      toast({
        title: 'Import Successful',
        description: data.message,
        type: data.results?.failed ? 'warning' : 'success',
      });
      onImported();
    } catch (err) {
      toast({
        title: 'Import Failed',
        description: err instanceof Error ? err.message : 'An error occurred during import',
        type: 'error',
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
            <CalendarPlus className="w-5 h-5" />
          </div>
          <CardTitle className="text-xl">Import Content</CardTitle>
        </div>
        <CardDescription>
          Upload a CSV of scheduled content. Include a{' '}
          <strong>content_type</strong> column —{' '}
          {CONTENT_TYPES.map((t) => CONTENT_TYPE_LABELS[t]).join(', ')} — plus a{' '}
          <strong>scheduled_date</strong>. Optional: title, caption, media_url, status.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="relative group">
          <div className="relative flex flex-col gap-4 p-5 bg-[var(--surface-subtle)]/50 border-2 border-dashed border-[var(--border)] rounded-xl group-hover:border-[var(--primary)]/30 transition-colors duration-300">
            <input
              type="file"
              id="content-csv-file"
              ref={fileInputRef}
              accept=".csv"
              onChange={handleImport}
              className="hidden"
              disabled={importing}
            />
            <div className="flex flex-wrap items-center gap-3">
              <label
                htmlFor="content-csv-file"
                className={`flex-1 min-w-[140px] px-4 py-2.5 border border-[var(--border)] bg-[var(--surface)] rounded-lg font-medium text-[var(--text-secondary)] transition-all duration-300 flex items-center justify-center gap-2 shadow-sm ${
                  importing
                    ? 'opacity-50 cursor-not-allowed'
                    : 'cursor-pointer hover:border-[var(--primary)] hover:text-[var(--primary)] hover:shadow-md'
                }`}
              >
                <Upload className="w-4 h-4" />
                <span className="whitespace-nowrap">Choose CSV</span>
              </label>
              <a
                href="/sample-content.csv"
                download="content-template.csv"
                className="flex-1 min-w-[120px] px-4 py-2.5 border border-[var(--border)] bg-transparent rounded-lg font-medium text-[var(--primary)] transition-all duration-300 flex items-center justify-center gap-2 hover:bg-[var(--primary)]/5 hover:border-[var(--primary)]/30"
                title="Download CSV template"
              >
                <FileDown className="w-4 h-4" />
                Template
              </a>
            </div>
            <div className="w-full">
              <span className="text-sm text-[var(--text-secondary)] block text-center">
                {importing ? 'Importing content...' : 'Upload scheduled content via CSV'}
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
