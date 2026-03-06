import React, { useState, useEffect } from 'react';
import { Search, Download, RefreshCw, CheckCircle, Clock, Mail, AlertCircle, Send, Edit2, Check, X, Filter, Trash2 } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast/use-toast';

interface License {
  id: string;
  email: string;
  isActivated: boolean;
  activatedAt: string | null;
  createdAt: string;
  businessName?: string;
  businessType?: string;
  messageId?: string | null;
  emailStatus?: string | null;
}

interface PaginationInfo {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface LicenseListProps {
  licenses: License[];
  loading: boolean;
  onRefresh: () => void;
  pagination?: PaginationInfo;
  onPageChange?: (page: number) => void;
  onSearch?: (search: string) => void;
  onStatusFilter?: (status: string) => void;
}

export function LicenseList({ licenses, loading, onRefresh, pagination, onPageChange, onSearch, onStatusFilter }: LicenseListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editingLicenseId, setEditingLicenseId] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState('');
  const [updatingEmail, setUpdatingEmail] = useState(false);
  const [syncingStatuses, setSyncingStatuses] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [licenseToDelete, setLicenseToDelete] = useState<License | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [hasInitialSynced, setHasInitialSynced] = useState(false);
  const { toast } = useToast();

  // Debounced search - only trigger server search after user stops typing
  useEffect(() => {
    if (!onSearch) return;
    
    const timer = setTimeout(() => {
      onSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]); // Only depend on searchTerm, not onSearch to avoid infinite loops

  // Handle status filter change
  const handleStatusChange = (newStatus: string) => {
    setStatusFilter(newStatus);
    if (onStatusFilter) {
      onStatusFilter(newStatus);
    }
  };

  // Sync email statuses from Resend to database on component mount (only once)
  useEffect(() => {
    const syncEmailStatuses = async () => {
      // Only sync once on initial load
      if (hasInitialSynced || loading) return;
      
      // Only sync if there are licenses with message IDs
      const hasMessageIds = licenses.some(license => license.messageId);
      if (!hasMessageIds) return;

      setSyncingStatuses(true);
      setHasInitialSynced(true); // Mark as synced to prevent re-running
      
      try {
        const response = await fetch('/api/licenses/email-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (response.ok) {
          const data = await response.json();
          console.log(`Synced ${data.synced} email statuses from Resend`);
          // Refresh the license list to show updated statuses
          if (onRefresh) {
            onRefresh();
          }
        }
      } catch (error) {
        console.error('Failed to sync email statuses:', error);
      } finally {
        setSyncingStatuses(false);
      }
    };

    syncEmailStatuses();
  }, [licenses.length, loading, hasInitialSynced]); // Only run once when licenses are first loaded

  // Use licenses directly since filtering is now done server-side
  const filteredLicenses = onSearch ? licenses : licenses.filter(license =>
    license.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleEditEmail = (license: License) => {
    setEditingLicenseId(license.id);
    setEditingEmail(license.email);
  };

  const handleCancelEdit = () => {
    setEditingLicenseId(null);
    setEditingEmail('');
  };

  const handleSaveEmail = async (licenseId: string) => {
    if (!editingEmail || !editingEmail.includes('@')) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address",
        type: "error"
      });
      return;
    }

    setUpdatingEmail(true);
    try {
      const response = await fetch('/api/licenses/update-email', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseId, newEmail: editingEmail }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast({
          title: "Error",
          description: data.error || 'Failed to update email',
          type: "error"
        });
        return;
      }

      toast({
        title: "Success",
        description: "Email updated successfully",
        type: "success"
      });

      setEditingLicenseId(null);
      setEditingEmail('');
      onRefresh();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update email",
        type: "error"
      });
    } finally {
      setUpdatingEmail(false);
    }
  };

  const handleSyncStatuses = async () => {
    setSyncingStatuses(true);
    try {
      const response = await fetch('/api/licenses/email-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Success",
          description: `Synced ${data.synced} email statuses`,
          type: "success"
        });
        onRefresh();
      } else {
        toast({
          title: "Error",
          description: "Failed to sync email statuses",
          type: "error"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to sync email statuses",
        type: "error"
      });
    } finally {
      setSyncingStatuses(false);
    }
  };

  const handleResendEmail = async (licenseId: string) => {
    try {
      const response = await fetch('/api/licenses/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to resend email');
      }

      toast({
        title: "Email Sent",
        description: "Invitation email resent successfully!",
        type: "success"
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || 'An error occurred',
        type: "error"
      });
    }
  };

  const openDeleteModal = (license: License) => {
    setLicenseToDelete(license);
    setDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setLicenseToDelete(null);
    setDeleteModalOpen(false);
  };

  const handleDeleteLicense = async () => {
    if (!licenseToDelete) return;

    setDeleting(true);
    try {
      const response = await fetch('/api/licenses/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseId: licenseToDelete.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete license');
      }

      toast({
        title: "Success",
        description: "License deleted successfully",
        type: "success"
      });

      closeDeleteModal();
      onRefresh();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || 'An error occurred',
        type: "error"
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleCsvExport = async () => {
    try {
      const response = await fetch('/api/licenses/export');
      
      if (!response.ok) {
        throw new Error('Failed to export CSV');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `license-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Export Successful",
        description: "CSV exported successfully!",
        type: "success"
      });
    } catch (err: any) {
      toast({
        title: "Export Failed",
        description: err.message || 'An error occurred during export',
        type: "error"
      });
    }
  };

  return (
    <Card variant="glass" className="overflow-hidden border border-[var(--border)] shadow-sm">
      <CardHeader className="border-b border-[var(--border)] bg-[var(--surface)]/50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-xl">Assigned Licenses</CardTitle>
            <CardDescription className="mt-1">
              User details populate automatically after invitation acceptance
            </CardDescription>
          </div>
          <div className="flex gap-2">
             <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSyncStatuses}
                disabled={syncingStatuses}
                className="h-9"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-2 ${syncingStatuses ? 'animate-spin' : ''}`} />
                {syncingStatuses ? 'Syncing' : 'Sync Status'}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleCsvExport}
                className="h-9"
              >
                <Download className="w-3.5 h-3.5 mr-2" />
                Export
              </Button>
          </div>
        </div>
        
        <div className="mt-4 flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
            <input
              type="text"
              placeholder="Search by email..."
              className="w-full pl-9 pr-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {onStatusFilter && (
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
              <select
                value={statusFilter}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="pl-9 pr-8 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all appearance-none cursor-pointer"
              >
                <option value="">All Status</option>
                <option value="activated">Activated</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <div className="text-center py-20 flex flex-col items-center justify-center">
            <Spinner size="lg" variant="primary" />
            <p className="mt-4 text-[var(--text-secondary)] animate-pulse font-medium">Loading licenses...</p>
          </div>
        ) : filteredLicenses.length === 0 ? (
          <div className="text-center py-20 bg-[var(--surface-subtle)]/30">
            <div className="w-16 h-16 bg-[var(--surface-subtle)] rounded-full flex items-center justify-center mx-auto mb-4 border border-[var(--border)]">
              <Search className="w-8 h-8 text-[var(--text-tertiary)]" />
            </div>
            <p className="text-[var(--text-primary)] font-medium text-lg">No licenses found</p>
            <p className="text-[var(--text-secondary)] text-sm mt-1">Try adjusting your search or add a new license.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[var(--surface-subtle)] border-b border-[var(--border)]">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Email</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Business</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Email Status</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Date Added</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Activated</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-[var(--surface)] divide-y divide-[var(--border)]">
                {filteredLicenses.map((license) => (
                  <tr key={license.id} className="hover:bg-[var(--surface-subtle)]/50 transition-colors duration-200 group">
                    <td className="px-6 py-4 text-sm font-medium text-[var(--text-primary)]">
                      {editingLicenseId === license.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="email"
                            value={editingEmail}
                            onChange={(e) => setEditingEmail(e.target.value)}
                            className="px-2 py-1 border border-[var(--primary)] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 w-full min-w-[200px]"
                            autoFocus
                            disabled={updatingEmail}
                          />
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleSaveEmail(license.id)}
                              disabled={updatingEmail}
                              className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors"
                              title="Save"
                            >
                              {updatingEmail ? <Spinner size="sm" className="w-3 h-3" /> : <Check className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              disabled={updatingEmail}
                              className="p-1 text-gray-500 hover:bg-gray-100 rounded transition-colors"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 group/email">
                          <span className="truncate max-w-[220px]" title={license.email}>{license.email}</span>
                          {!license.isActivated && (
                            <button
                              onClick={() => handleEditEmail(license)}
                              className="p-1 text-[var(--text-tertiary)] hover:text-[var(--primary)] opacity-0 group-hover/email:opacity-100 transition-all"
                              title="Edit email"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">
                      {license.isActivated && (license.businessName || license.businessType) ? (
                        <div className="flex flex-col">
                           <span className="font-medium text-[var(--text-primary)]">{license.businessName || '-'}</span>
                           <span className="text-xs text-[var(--text-tertiary)]">{license.businessType}</span>
                        </div>
                      ) : (
                        <span className="text-[var(--text-tertiary)] italic">Pending setup</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium capitalize border ${
                        license.isActivated 
                          ? 'bg-green-50 text-green-700 border-green-200' 
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {license.isActivated ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : (
                          <Clock className="w-3 h-3" />
                        )}
                        {license.isActivated ? 'Activated' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span 
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium capitalize border ${
                          license.emailStatus === 'delivered' || license.emailStatus === 'opened'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                            : license.emailStatus === 'bounced' || license.emailStatus === 'complained' || license.emailStatus === 'failed'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : license.emailStatus === 'sent'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-gray-50 text-gray-600 border-gray-200'
                        }`}
                      >
                        {license.emailStatus === 'delivered' || license.emailStatus === 'opened' ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : license.emailStatus === 'bounced' || license.emailStatus === 'complained' || license.emailStatus === 'failed' ? (
                          <AlertCircle className="w-3 h-3" />
                        ) : license.emailStatus === 'sent' ? (
                          <Send className="w-3 h-3" />
                        ) : (
                          <Mail className="w-3 h-3" />
                        )}
                        {license.emailStatus || 'queued'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">{formatDate(license.createdAt)}</td>
                    <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">
                      {license.activatedAt ? formatDate(license.activatedAt) : <span className="text-[var(--text-tertiary)]">-</span>}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!license.isActivated && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleResendEmail(license.id)}
                            className="h-8 text-[var(--primary)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10"
                            title="Resend Invitation"
                          >
                            Resend
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => openDeleteModal(license)}
                          disabled={license.isActivated}
                          className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          title={license.isActivated ? "Cannot delete activated license" : "Delete License"}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--surface-subtle)]/30 flex justify-between items-center text-xs text-[var(--text-tertiary)]">
          <span>
            {pagination 
              ? `Showing ${((pagination.page - 1) * pagination.limit) + 1}-${Math.min(pagination.page * pagination.limit, pagination.totalCount)} of ${pagination.totalCount} license${pagination.totalCount !== 1 ? 's' : ''}`
              : `Showing ${filteredLicenses.length} license${filteredLicenses.length !== 1 ? 's' : ''}`
            }
          </span>
          {pagination && pagination.totalPages > 1 && onPageChange && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(pagination.page - 1)}
                disabled={!pagination.hasPrevPage || loading}
                className="h-7 px-2 text-xs"
              >
                Previous
              </Button>
              <span className="px-2 text-[var(--text-secondary)]">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(pagination.page + 1)}
                disabled={!pagination.hasNextPage || loading}
                className="h-7 px-2 text-xs"
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </CardContent>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && licenseToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
            onClick={closeDeleteModal}
          />
          <div className="relative bg-[var(--surface)] rounded-xl shadow-2xl border border-[var(--border)] p-6 max-w-md w-full mx-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center bg-red-100 text-red-600">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                  Delete License
                </h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  {licenseToDelete.email}
                </p>
              </div>
            </div>
            
            <p className="text-[var(--text-secondary)] mb-6">
              Are you sure you want to delete this license? This action cannot be undone and the license will be permanently removed from the database.
            </p>

            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={closeDeleteModal}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleDeleteLicense}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleting ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
