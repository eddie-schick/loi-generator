import { useState, useCallback, useEffect } from 'react';
import Header from './components/Header';
import StepIndicator from './components/StepIndicator';
import LOIForm from './components/LOIForm';
import LOIPreview from './components/LOIPreview';
import SignaturePanel from './components/SignaturePanel';

export default function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [loiText, setLoiText] = useState('');
  const [pdfBase64, setPdfBase64] = useState('');
  const [pdfFilename, setPdfFilename] = useState('');
  const [loiVersion, setLoiVersion] = useState(0);
  const [dealData, setDealData] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    }
  }, [currentStep]);

  const generateLOI = useCallback(async (deal) => {
    setIsGenerating(true);
    setError('');
    setDealData(deal);

    try {
      const res = await fetch('/api/generate-loi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deal),
      });

      const data = await res.json();
      console.log('[LOI Generate] status:', res.status, 'has text:', !!data.text, 'text length:', data.text?.length, 'has pdf:', !!data.pdfBase64, 'pdf length:', data.pdfBase64?.length);

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate LOI');
      }

      setLoiText(data.text);
      setPdfBase64(data.pdfBase64);
      setPdfFilename(data.filename);
      setLoiVersion(v => v + 1);
      setCurrentStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const regenerateLOI = useCallback(async () => {
    if (!dealData) return;
    setIsRegenerating(true);
    setError('');

    try {
      const res = await fetch('/api/generate-loi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dealData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to regenerate LOI');
      }

      setLoiText(data.text);
      setPdfBase64(data.pdfBase64);
      setPdfFilename(data.filename);
      setLoiVersion(v => v + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsRegenerating(false);
    }
  }, [dealData]);

  function handleSendForSignature(editedText, pdf) {
    setLoiText(editedText);
    if (pdf) setPdfBase64(pdf);
    setCurrentStep(3);
  }

  function handleStartNew() {
    setCurrentStep(1);
    setLoiText('');
    setPdfBase64('');
    setPdfFilename('');
    setDealData(null);
    setError('');
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <Header />
      <StepIndicator currentStep={currentStep} />

      <main className="px-4 sm:px-6 pb-12 min-h-0 overflow-x-hidden">
        {error && (
          <div className="max-w-4xl mx-auto mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex flex-wrap items-center justify-between gap-2">
            <span className="flex-1 min-w-0">{error}</span>
            <button onClick={() => setError('')} className="text-red-500 hover:text-red-700 p-2 -m-2 touch-manipulation flex-shrink-0" aria-label="Dismiss error">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {currentStep === 1 && (
          <LOIForm onGenerate={generateLOI} isGenerating={isGenerating} />
        )}

        {currentStep === 2 && (
          <LOIPreview
            key={loiVersion}
            loiText={loiText}
            pdfBase64={pdfBase64}
            dealData={dealData}
            onBack={() => setCurrentStep(1)}
            onRegenerate={regenerateLOI}
            onSendForSignature={handleSendForSignature}
            isRegenerating={isRegenerating}
          />
        )}

        {currentStep === 3 && (
          <SignaturePanel
            loiText={loiText}
            pdfBase64={pdfBase64}
            dealData={dealData}
            onStartNew={handleStartNew}
          />
        )}
      </main>
    </div>
  );
}
