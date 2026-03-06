import { useState, useEffect, useCallback } from 'react';

const STATUS_COLORS = {
  created: 'bg-neutral-200 text-neutral-700',
  sent: 'bg-teal-primary/10 text-teal-dark',
  delivered: 'bg-teal-primary/10 text-teal-dark',
  signed: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  declined: 'bg-red-100 text-red-800',
  voided: 'bg-neutral-200 text-neutral-700',
};

export default function SignaturePanel({ loiText, pdfBase64, dealData, onStartNew }) {
  const [recipientEmail, setRecipientEmail] = useState(dealData.signorEmail || dealData.contactEmail || '');
  const [recipientName, setRecipientName] = useState(
    dealData.signorName || `${dealData.contactFirstName || ''} ${dealData.contactLastName || ''}`.trim()
  );
  const [personalMessage, setPersonalMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [envelopeId, setEnvelopeId] = useState(null);
  const [envelopeStatus, setEnvelopeStatus] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const pollStatus = useCallback(async () => {
    if (!envelopeId) return;
    try {
      const res = await fetch(`/api/envelope-status?envelopeId=${envelopeId}`);
      if (res.ok) {
        const data = await res.json();
        setEnvelopeStatus(data.status);
      }
    } catch {
      // silently fail polling
    }
  }, [envelopeId]);

  useEffect(() => {
    if (!envelopeId) return;
    pollStatus();
    const interval = setInterval(pollStatus, 15000);
    return () => clearInterval(interval);
  }, [envelopeId, pollStatus]);

  async function handleSend() {
    if (!recipientEmail || !recipientName) {
      setError('Recipient name and email are required.');
      return;
    }

    setIsSending(true);
    setError('');

    try {
      const res = await fetch('/api/send-docusign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loiText,
          pdfBase64,
          companyName: dealData.companyName,
          signerEmail: recipientEmail,
          signerName: recipientName,
          personalMessage,
          shaedSignatory: dealData.shaedSignatory,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send envelope');
      }

      setEnvelopeId(data.envelopeId);
      setEnvelopeStatus(data.status);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSending(false);
    }
  }

  function copyEnvelopeId() {
    navigator.clipboard.writeText(envelopeId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownloadPdf() {
    if (!pdfBase64) return;
    const byteChars = atob(pdfBase64);
    const byteNumbers = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([byteNumbers], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SHAED_LOI_${dealData.companyName?.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Envelope sent — success state
  if (envelopeId) {
    return (
      <div className="max-w-lg mx-auto px-0">
        <div className="card p-6 sm:p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-neutral-900 mb-2">LOI Sent for Signature</h3>
          <p className="text-sm text-neutral-700 mb-6">
            The LOI has been sent to <strong>{recipientName}</strong> at {recipientEmail}.
          </p>

          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
              <span className="text-xs text-neutral-700">Envelope ID</span>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono text-neutral-900">{envelopeId.slice(0, 12)}...</code>
                <button onClick={copyEnvelopeId} className="text-xs text-teal-primary hover:text-teal-dark">
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
              <span className="text-xs text-neutral-700">Status</span>
              <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${STATUS_COLORS[envelopeStatus] || STATUS_COLORS.sent}`}>
                {envelopeStatus?.charAt(0).toUpperCase() + envelopeStatus?.slice(1) || 'Sent'}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button onClick={onStartNew} className="btn-primary py-2.5">
              Start New LOI
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={!pdfBase64}
              className="btn-secondary py-2.5"
            >
              Download LOI (.pdf)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Send form — no login required, JWT handles auth server-side
  return (
    <div className="max-w-lg mx-auto px-0">
      <div className="card p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-neutral-900 mb-1">Send for E-Signature</h3>
        <p className="text-sm text-neutral-700 mb-6">
          Send the LOI via DocuSign. The counterparty signs first, then SHAED signs second.
        </p>

        {error && (
          <div className="p-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="form-label">Recipient Name</label>
            <input
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              className="form-input"
            />
          </div>
          <div>
            <label className="form-label">Recipient Email</label>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              className="form-input"
            />
          </div>
          <div>
            <label className="form-label">Personal Message (optional)</label>
            <textarea
              value={personalMessage}
              onChange={(e) => setPersonalMessage(e.target.value)}
              rows={3}
              className="form-input resize-none"
              placeholder="Add a note to include in the DocuSign email..."
            />
          </div>

          <button
            onClick={handleSend}
            disabled={isSending}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2"
          >
            {isSending ? (
              <>
                <span className="spinner !w-5 !h-5 !border-2 !border-white/30 !border-t-white"></span>
                Sending...
              </>
            ) : (
              'Send for Signature'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
