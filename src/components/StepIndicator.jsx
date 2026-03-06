const steps = [
  { number: 1, label: 'Deal Details' },
  { number: 2, label: 'Review LOI' },
  { number: 3, label: 'Send for Signature' },
];

export default function StepIndicator({ currentStep }) {
  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2 py-4 sm:py-6 px-2 overflow-x-auto">
      {steps.map((step, i) => (
        <div key={step.number} className="flex items-center flex-shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors shrink-0 ${
                currentStep >= step.number
                  ? 'text-white'
                  : 'bg-neutral-200 text-neutral-700'
              }`}
              style={currentStep >= step.number ? { background: 'var(--gradient-primary)' } : {}}
            >
              {currentStep > step.number ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                step.number
              )}
            </div>
            <span
              className={`text-sm font-medium hidden sm:inline ${
                currentStep >= step.number ? 'text-teal-dark' : 'text-neutral-700'
              }`}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`w-8 sm:w-12 md:w-20 h-0.5 mx-1 sm:mx-2 ${
                currentStep > step.number ? 'bg-teal-primary' : 'bg-neutral-200'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
