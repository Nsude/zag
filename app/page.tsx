'use client';

import { useState } from 'react';

interface ScanResult {
  companyName: string;
  websiteUrl: string;
  rolesFound: boolean;
  founders: string[];
  emails: string[];
  emailDraft: string;
  domain: string;
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [status, setStatus] = useState<Record<string, string>>({});

  const startScan = async () => {
    setLoading(true);
    setResults([]);
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        body: JSON.stringify({ limit: 5 }),
      });
      const data = await res.json();
      setResults(data.results || []);
    } catch (error) {
      console.error('Scan failed:', error);
      alert('Scan failed');
    } finally {
      setLoading(false);
    }
  };

  const sendEmail = async (result: ScanResult, index: number) => {
    const currentStatus = status[result.domain];
    if (currentStatus === 'Sent') return;

    setStatus(prev => ({ ...prev, [result.domain]: 'Sending...' }));

    // Use the first generated email or allow user to pick (simplification: use first)
    const to = result.emails[0];
    if (!to) {
      alert('No email address generated');
      setStatus(prev => ({ ...prev, [result.domain]: 'Failed: No Email' }));
      return;
    }

    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        body: JSON.stringify({
          to,
          subject: `Intro: ${result.companyName}`, // Simple subject
          body: result.emailDraft,
          companyName: result.companyName,
          domain: result.domain,
          founderName: result.founders[0] || 'Founder'
        }),
      });

      if (res.ok) {
        setStatus(prev => ({ ...prev, [result.domain]: 'Sent' }));
      } else {
        setStatus(prev => ({ ...prev, [result.domain]: 'Failed' }));
      }
    } catch (error) {
      console.error('Send failed:', error);
      setStatus(prev => ({ ...prev, [result.domain]: 'Error' }));
    }
  };

  const updateDraft = (index: number, newDraft: string) => {
    const newResults = [...results];
    newResults[index].emailDraft = newDraft;
    setResults(newResults);
  };

  return (
    <main className="min-h-screen p-8 bg-gray-50 text-gray-900 font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Founder Outreach Automation</h1>
          <button
            onClick={startScan}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Scanning...' : 'Start Scan'}
          </button>
        </header>

        {results.length === 0 && !loading && (
          <div className="text-center py-20 text-gray-500">
            <p>Click "Start Scan" to find companies.</p>
          </div>
        )}

        <div className="space-y-6">
          {results.map((result, index) => (
            <div key={index} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
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
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Draft</label>
                <textarea
                  value={result.emailDraft}
                  onChange={(e) => updateDraft(index, e.target.value)}
                  className="w-full h-64 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                />
              </div>

              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-600">
                  <strong>To:</strong> {result.emails.join(', ') || 'Unknown'}
                </div>
                <button
                  onClick={() => sendEmail(result, index)}
                  disabled={status[result.domain] === 'Sent' || status[result.domain] === 'Sending...'}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${status[result.domain] === 'Sent'
                      ? 'bg-green-500 text-white cursor-default'
                      : 'bg-gray-900 text-white hover:bg-gray-800'
                    }`}
                >
                  {status[result.domain] || 'Approve & Send'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
