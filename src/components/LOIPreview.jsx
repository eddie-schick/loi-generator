import { useState, useEffect, useCallback } from 'react';

export default function LOIPreview({ loiText, pdfBase64: initialPdfBase64, dealData, onBack, onRegenerate, onSendForSignature, isRegenerating }) {
  const [revisionHistory, setRevisionHistory] = useState([
    { version: 1, text: loiText, pdfBase64: initialPdfBase64 }
  ]);
  const [currentVersion, setCurrentVersion] = useState(1);
  const [isEditing, setIsEditing] = useState(false);
  const [editInstruction, setEditInstruction] = useState('');
  const [isRevising, setIsRevising] = useState(false);
  const [revisionError, setRevisionError] = useState('');
  const [isRenderingPdf, setIsRenderingPdf] = useState(false);

  const current = revisionHistory.find(r => r.version === currentVersion);
  const currentText = current?.text || loiText || '';
  const currentPdf = current?.pdfBase64 || null;
  const charCount = currentText.length;

  // When switching from edit to preview with a dirty PDF, regenerate server-side
  const regeneratePdf = useCallback(async (text) => {
    setIsRenderingPdf(true);
    try {
      const res = await fetch('/api/render-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, dealData }),
      });
      const data = await res.json();
      if (res.ok && data.pdfBase64) {
        setRevisionHistory(prev =>
          prev.map(r => r.version === currentVersion ? { ...r, pdfBase64: data.pdfBase64 } : r)
        );
      }
    } catch (err) {
      console.error('PDF render error:', err);
    } finally {
      setIsRenderingPdf(false);
    }
  }, [currentVersion, dealData]);

  // Auto-regenerate PDF when switching to preview and PDF is stale
  useEffect(() => {
    if (!isEditing && !currentPdf && currentText && !isRenderingPdf) {
      regeneratePdf(currentText);
    }
  }, [isEditing, currentPdf, currentText, isRenderingPdf, regeneratePdf]);

  function handleTextEdit(e) {
    const newText = e.target.value;
    setRevisionHistory(prev =>
      prev.map(r => r.version === currentVersion ? { ...r, text: newText, pdfBase64: null } : r)
    );
  }

  async function handleSend() {
    let pdf = currentPdf;
    if (!pdf) {
      // Regenerate PDF before sending
      setIsRenderingPdf(true);
      try {
        const res = await fetch('/api/render-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: currentText, dealData }),
        });
        const data = await res.json();
        if (res.ok) pdf = data.pdfBase64;
      } catch { /* fall through */ } finally {
        setIsRenderingPdf(false);
      }
    }
    onSendForSignature(currentText, pdf);
  }

  function handleRegenerate() {
    onRegenerate();
  }

  async function handleRevise() {
    if (!editInstruction.trim()) return;

    setIsRevising(true);
    setRevisionError('');

    try {
      const res = await fetch('/api/edit-loi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          existingLOI: currentText,
          editInstruction: editInstruction.trim(),
          dealData,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to revise LOI');
      }

      const newVersion = revisionHistory.length + 1;
      setRevisionHistory(prev => [...prev, {
        version: newVersion,
        text: data.text,
        pdfBase64: data.pdfBase64,
      }]);
      setCurrentVersion(newVersion);
      setEditInstruction('');
    } catch (err) {
      setRevisionError(err.message);
    } finally {
      setIsRevising(false);
    }
  }

  function handleDownloadPdf() {
    if (!currentPdf) return;
    const byteChars = atob(currentPdf);
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

  // Build module chips from deal data
  const moduleLabels = { shop: 'Shop', track: 'Track', document: 'Document' };

  return (
    <div className="max-w-6xl mx-auto min-w-0">
      {/* Deal summary chips */}
      <div className="flex flex-wrap gap-2 mb-3 sm:mb-4">
        <span className="px-3 py-1 text-xs font-medium rounded-full bg-teal-primary/10 text-teal-dark">
          {dealData.companyName}
        </span>
        {dealData.modules?.map((m, i) => {
          const key = Object.keys(moduleLabels).find(k =>
            m.toLowerCase().includes(k)
          );
          return (
            <span key={i} className="px-3 py-1 text-xs font-medium rounded-full bg-navy/10 text-navy">
              {key ? moduleLabels[key] : m.split('—')[0].trim()}
            </span>
          );
        })}
        {dealData.subscriptionFee && (
          <span className="px-3 py-1 text-xs font-medium rounded-full bg-neutral-100 text-neutral-700">
            {dealData.subscriptionFee}/mo
          </span>
        )}
        {dealData.implementation === 'yes' && dealData.implementationFee && (
          <span className="px-3 py-1 text-xs font-medium rounded-full bg-neutral-100 text-neutral-700">
            {dealData.implementationFee} impl.
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* LOI Preview — left 2/3 */}
        <div className="lg:col-span-2 space-y-4 min-w-0">
          <div className="card p-4 sm:p-6 lg:p-8">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-4">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
                <h3 className="text-sm font-semibold text-neutral-900">Letter of Intent</h3>
                {/* Version chips */}
                {revisionHistory.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1">
                    {revisionHistory.map(r => (
                      <button
                        key={r.version}
                        onClick={() => setCurrentVersion(r.version)}
                        className={`px-2 py-1 text-xs rounded-full transition-colors touch-manipulation ${
                          r.version === currentVersion
                            ? 'bg-teal-primary text-white font-semibold'
                            : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                        }`}
                      >
                        v{r.version}{r.version === revisionHistory.length ? ' (current)' : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-neutral-700">{charCount.toLocaleString()} chars</span>
                <button
                  type="button"
                  onClick={() => setIsEditing(!isEditing)}
                  className="text-xs px-2 py-1.5 sm:py-1 rounded border border-neutral-200 text-neutral-700 hover:bg-neutral-50 touch-manipulation min-h-[36px] sm:min-h-0"
                >
                  {isEditing ? 'Preview' : 'Edit'}
                </button>
              </div>
            </div>

            {isEditing ? (
              <textarea
                value={currentText}
                onChange={handleTextEdit}
                className="w-full min-h-[320px] sm:min-h-[480px] lg:min-h-[600px] font-mono text-sm leading-relaxed p-3 sm:p-4 border border-neutral-200 rounded-lg focus:border-teal-primary focus:ring-1 focus:ring-teal-primary/20 outline-none resize-y"
                style={{ fontFamily: "'Courier New', monospace", fontSize: '0.8125rem' }}
              />
            ) : isRenderingPdf ? (
              <div className="flex items-center justify-center min-h-[320px] sm:min-h-[480px] lg:min-h-[600px] bg-neutral-50 rounded-lg">
                <div className="flex flex-col items-center gap-3">
                  <span className="spinner !w-8 !h-8 !border-3"></span>
                  <span className="text-sm text-neutral-700">Rendering PDF...</span>
                </div>
              </div>
            ) : currentPdf ? (
              <iframe
                src={`data:application/pdf;base64,${currentPdf}`}
                width="100%"
                height="800px"
                style={{ border: 'none', borderRadius: '8px' }}
                title="LOI Preview"
              />
            ) : (
              <div className="flex items-center justify-center min-h-[320px] sm:min-h-[480px] lg:min-h-[600px] bg-neutral-50 rounded-lg">
                <span className="text-sm text-neutral-500">PDF preview not available</span>
              </div>
            )}
          </div>

          {/* AI Edit Panel */}
          <div
            className="rounded-xl p-4 sm:p-5 border-l-4"
            style={{ background: '#E8F5F3', borderLeftColor: 'var(--teal-primary)' }}
          >
            <h4 className="text-sm font-semibold text-neutral-900 mb-3">Request a Change</h4>
            <textarea
              value={editInstruction}
              onChange={(e) => setEditInstruction(e.target.value)}
              rows={3}
              className="w-full border border-neutral-200 rounded-lg p-3 text-sm resize-none outline-none focus:border-teal-primary focus:ring-1 focus:ring-teal-primary/20 bg-white min-h-[80px]"
              placeholder={'e.g. "Change the implementation fee to $30,000"\n"Add a 90-day pilot period before subscription"\n"Remove the confidentiality section"'}
              disabled={isRevising}
            />

            {revisionError && (
              <p className="text-error text-xs mt-2">{revisionError}</p>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mt-3">
              <button
                onClick={handleRevise}
                disabled={isRevising || !editInstruction.trim()}
                className="btn-primary py-2.5 sm:py-2 px-5 text-sm flex items-center justify-center gap-2 min-h-[44px] sm:min-h-0"
              >
                {isRevising ? (
                  <>
                    <span className="spinner !w-4 !h-4 !border-2 !border-white/30 !border-t-white"></span>
                    Applying changes...
                  </>
                ) : (
                  'Revise with AI →'
                )}
              </button>
              {revisionHistory.length > 1 && (
                <span className="text-xs text-neutral-700">
                  {revisionHistory.length} version{revisionHistory.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right pane — controls */}
        <div className="space-y-4 min-w-0">
          <div className="card p-4">
            <h4 className="text-sm font-semibold text-neutral-900 mb-3">Actions</h4>
            <div className="space-y-2">
              <button
                onClick={handleSend}
                className="btn-primary w-full py-2.5 min-h-[44px] sm:min-h-0"
              >
                Send for Signature →
              </button>
              <button
                onClick={handleRegenerate}
                disabled={isRegenerating}
                className="btn-secondary w-full py-2.5 min-h-[44px] sm:min-h-0 flex items-center justify-center gap-2"
              >
                {isRegenerating ? (
                  <>
                    <span className="spinner !w-4 !h-4 !border-2"></span>
                    Regenerating...
                  </>
                ) : (
                  'Regenerate'
                )}
              </button>
              <button
                onClick={onBack}
                className="btn-secondary w-full py-2.5 min-h-[44px] sm:min-h-0"
              >
                ← Back to Form
              </button>
            </div>
          </div>

          <div className="card p-4">
            <h4 className="text-sm font-semibold text-neutral-900 mb-3">Quick Actions</h4>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleDownloadPdf}
                disabled={!currentPdf}
                className="text-sm text-teal-primary hover:text-teal-dark font-medium text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Download LOI (.pdf)
              </button>
            </div>
          </div>

          <div className="card p-4">
            <h4 className="text-sm font-semibold text-neutral-900 mb-2">Tips</h4>
            <ul className="text-xs text-neutral-700 space-y-1">
              <li>Use "Request a Change" to ask AI for specific edits</li>
              <li>Click version chips to compare or revert</li>
              <li>Click "Edit" for direct text changes</li>
              <li>Anchor tags like /sig1/ are for DocuSign — keep them</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
