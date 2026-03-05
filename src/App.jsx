import { useState, useCallback } from 'react';
import Header from './components/Header';
import StepIndicator from './components/StepIndicator';
import LOIForm from './components/LOIForm';
import LOIPreview from './components/LOIPreview';
import SignaturePanel from './components/SignaturePanel';
import useDocuSign from './hooks/useDocuSign';

export default function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [loiText, setLoiText] = useState('');
  const [dealData, setDealData] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState('');

  const { isConnected: isDocuSignConnected } = useDocuSign();

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

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate LOI');
      }

      setLoiText(data.loi);
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

      setLoiText(data.loi);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsRegenerating(false);
    }
  }, [dealData]);

  function handleSendForSignature(editedText) {
    setLoiText(editedText);
    setCurrentStep(3);
  }

  function handleStartNew() {
    setCurrentStep(1);
    setLoiText('');
    setDealData(null);
    setError('');
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <Header />
      <StepIndicator currentStep={currentStep} />

      <main className="px-4 sm:px-6 pb-12">
        {error && (
          <div className="max-w-4xl mx-auto mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-500 hover:text-red-700 ml-4">
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
            loiText={loiText}
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
            dealData={dealData}
            isDocuSignConnected={isDocuSignConnected}
            onStartNew={handleStartNew}
          />
        )}
      </main>
    </div>
  );
}
