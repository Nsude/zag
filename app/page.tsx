'use client';

import { useState } from 'react';
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export default function Home() {
  const [scanning, setScanning] = useState(false);
  const [page, setPage] = useState(1);
  const results = useQuery(api.companies.list, { page }) || [];
  const totalCount = useQuery(api.companies.count) || 0;
  const totalPages = Math.ceil(totalCount / 10);

  const runScan = useAction(api.scan.run);
  const sendEmailAction = useAction(api.email.send);
  const updateDraftMutation = useMutation(api.companies.updateDraft);
  const markContactedMutation = useMutation(api.companies.markContacted);
  const blacklistMutation = useMutation(api.companies.blacklist);

  const [status, setStatus] = useState<Record<string, string>>({});

  const startScan = async () => {
    setScanning(true);
    try {
      await runScan({ limit: 5 });
    } catch (error) {
      console.error('Scan failed:', error);
      alert('Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const sendEmail = async (result: any) => {
    const currentStatus = status[result.domain] || result.status;
    if (currentStatus === 'Sent' || currentStatus === 'Contacted') return;

    setStatus(prev => ({ ...prev, [result.domain]: 'Sending...' }));

    const to = result.emails[0];
    if (!to) {
      alert('No email address generated');
      setStatus(prev => ({ ...prev, [result.domain]: 'Failed: No Email' }));
      return;
    }

    // Get remaining emails as CC's
    const cc = result.emails.length > 1 ? result.emails.slice(1).join(', ') : undefined;

    try {
      await sendEmailAction({
        to,
        ...(cc && { cc }), // Only include cc if there are additional emails
        subject: `Intro: ${result.companyName}`,
        body: result.emailDraft,
        companyName: result.companyName,
        domain: result.domain,
        founderName: result.founders[0] || 'Founder'
      });

      setStatus(prev => ({ ...prev, [result.domain]: 'Sent' }));
      await markContactedMutation({ id: result._id });
    } catch (error) {
      console.error('Send failed:', error);
      setStatus(prev => ({ ...prev, [result.domain]: 'Error' }));
    }
  };


  return (
    <main className="min-h-screen p-8 bg-gray-50 text-gray-900 font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Founder Outreach Automation</h1>
          <button
            onClick={startScan}
            disabled={scanning}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {scanning ? 'Scanning...' : 'Start Scan'}
          </button>
        </header>

        {results.length === 0 && !scanning && (
          <div className="text-center py-20 text-gray-500">
            <p>Click "Start Scan" to find companies.</p>
          </div>
        )}

        <div className="space-y-6">
          {results.map((result: any) => (
            <div key={result._id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-semibold">{result.companyName}</h2>
                  <a href={result.websiteUrl} target="_blank" className="text-blue-500 hover:underline text-sm">
                    {result.websiteUrl}
                  </a>
                </div>
                <div className="text-right">
                  {result.founders.length > 0 ? (
                    <span className="inline-block px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                      Founders: {result.founders.join(', ')}
                    </span>
                  ) : (
                    <span className="inline-block px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                      No Founders Found
                    </span>
                  )}
                  <div className="mt-1">
                    {result.status === 'Contacted' && (
                      <span className="text-xs text-green-600 font-bold">Contacted</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Draft</label>
                <textarea
                  value={result.emailDraft}
                  onChange={(e) => updateDraftMutation({ id: result._id, draft: e.target.value })}
                  className="w-full h-64 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                />
              </div>

              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-600">
                  {result.emails.length > 0 && (
                    <>
                      <div><strong>To:</strong> {result.emails[0]}</div>
                      {result.emails.length > 1 && (
                        <div><strong>CC:</strong> {result.emails.slice(1).join(', ')}</div>
                      )}
                    </>
                  )}
                  {result.emails.length === 0 && <span>No emails generated</span>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => blacklistMutation({ id: result._id })}
                    className="px-4 py-2 rounded-lg font-medium transition-colors bg-red-100 text-red-700 hover:bg-red-200"
                  >
                    Blacklist
                  </button>
                  <button
                    onClick={() => sendEmail(result)}
                    disabled={status[result.domain] === 'Sent' || status[result.domain] === 'Sending...' || result.status === 'Contacted'}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${status[result.domain] === 'Sent' || result.status === 'Contacted'
                      ? 'bg-green-500 text-white cursor-default'
                      : 'bg-gray-900 text-white hover:bg-gray-800'
                      }`}
                  >
                    {status[result.domain] === 'Sent' || result.status === 'Contacted' ? 'Sent' : (status[result.domain] || 'Approve & Send')}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination Controls */}
        {results.length > 0 && (
          <div className="mt-8 flex justify-center items-center gap-4">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-12 h-12 flex items-center justify-center bg-gray-200 rounded-xl hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              ←
            </button>
            <span className="text-gray-600 font-medium">
              Page {page} of {totalPages || 1}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="w-12 h-12 flex items-center justify-center bg-gray-200 rounded-xl hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              →
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
