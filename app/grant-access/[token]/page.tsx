'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle, XCircle, Loader2, Building2 } from 'lucide-react';

interface PartnerInfo {
  id: string;
  name: string;
  domain: string;
  status: string;
}

interface ApprovalResult {
  success: boolean;
  message: string;
  partner?: PartnerInfo;
  alreadyApproved?: boolean;
  error?: string;
}

export default function GrantAccessPage() {
  const params = useParams();
  const token = params.token as string;
  
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<ApprovalResult | null>(null);

  useEffect(() => {
    async function approvePartner() {
      try {
        const response = await fetch(`/api/partners/grant-access/${token}`);
        const data = await response.json();
        
        if (response.ok) {
          setResult({
            success: true,
            message: data.message,
            partner: data.partner,
            alreadyApproved: data.alreadyApproved,
          });
        } else {
          setResult({
            success: false,
            message: data.error || 'Failed to approve partner',
            error: data.error,
          });
        }
      } catch (error) {
        setResult({
          success: false,
          message: 'An unexpected error occurred',
          error: 'Network error',
        });
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      approvePartner();
    }
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-[#5843BE] mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-slate-700">Approving Partner...</h1>
          <p className="text-slate-500 mt-2">Please wait while we process the approval.</p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-800">Invalid Request</h1>
          <p className="text-slate-600 mt-2">The approval link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className={`p-6 ${result.success ? 'bg-[#5843BE]' : 'bg-red-500'}`}>
          <div className="flex items-center justify-center">
            {result.success ? (
              <CheckCircle className="w-16 h-16 text-white" />
            ) : (
              <XCircle className="w-16 h-16 text-white" />
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-8 text-center">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">
            {result.success 
              ? (result.alreadyApproved ? 'Already Approved' : 'Partner Approved!')
              : 'Approval Failed'
            }
          </h1>
          
          <p className="text-slate-600 mb-6">
            {result.message}
          </p>

          {result.success && result.partner && (
            <div className="bg-slate-50 rounded-xl p-6 mb-6">
              <div className="flex items-center justify-center mb-4">
                <div className="w-12 h-12 bg-[#5843BE]/10 rounded-full flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-[#5843BE]" />
                </div>
              </div>
              
              <h2 className="text-lg font-semibold text-slate-800 mb-1">
                {result.partner.name}
              </h2>
              
              <p className="text-sm text-slate-500 font-mono bg-[#5843BE]/10 inline-block px-3 py-1 rounded-full">
                {result.partner.domain}
              </p>
              
              <div className="mt-4 flex items-center justify-center gap-2">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                  Active
                </span>
              </div>
            </div>
          )}

          {result.success && (
            <p className="text-sm text-slate-500">
              Users from <strong>{result.partner?.domain}</strong> can now sign in to the Moil Partners platform.
            </p>
          )}

          {!result.success && (
            <p className="text-sm text-slate-500">
              If you believe this is an error, please contact support or try again from the Moil Admin Dashboard.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 pb-8">
          <a
            href="/"
            className="block w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-center transition-colors"
          >
            Go to Homepage
          </a>
        </div>
      </div>
    </div>
  );
}
