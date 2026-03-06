import { useState } from 'react';
import { formatCurrency, parseCurrencyInput } from '../utils/formatters';

const SEGMENTS = [
  'Upfitter',
  'OEM',
  'Equipment Manufacturer',
  'Dealer',
  'Buyer / Fleet Manager',
  'Logistics Provider',
  'Finance Provider',
];

const MODULES = [
  { id: 'shop', label: 'Shop', desc: 'Marketplace & customer acquisition' },
  { id: 'track', label: 'Track', desc: 'Real-time order tracking & network orchestration' },
  { id: 'document', label: 'Document', desc: 'AI-powered deal jacket processing' },
];

const DEMO_DATA = {
  companyName: 'Summit Truck Equipment',
  companySegment: 'Upfitter',
  companyDescription: 'Regional upfitter serving the Midwest, specializing in service body and crane installations for Class 4-6 trucks. 12 active dealer relationships across MN, WI, and IA. ~400 units upfitted annually.',
  signorName: 'Mike Torres',
  signorTitle: 'President',
  signorEmail: 'mtorres@summittruckequipment.com',
  platformUseCase: 'Met at NTEA Work Truck Week, March 2026. Looking to replace manual order tracking spreadsheets and eliminate the daily "where\'s my truck?" calls from their dealer network. Primary need is real-time order visibility across all 12 dealer relationships from one dashboard. Secondary interest in catalog presence for equipment listings.',
  modules: ['shop', 'track'],
  subscriptionFee: '',
  implementation: 'yes',
  implementationFee: '15000',
  discoveryPeriod: '90 days',
  other: 'Strong network effect fit — Summit supplies 8 dealers who are existing Pritchard Companies partners on SHAED. Warm introduction through Ryan Pritchard.',
  shaedSignatory: 'ryan',
};

function getInitialFormData() {
  return {
    companyName: '',
    companySegment: '',
    companyDescription: '',
    signorName: '',
    signorTitle: '',
    signorEmail: '',
    platformUseCase: '',
    modules: [],
    subscriptionFee: '',
    implementation: 'no',
    implementationFee: '25000',
    discoveryPeriod: '90 days',
    other: '',
    shaedSignatory: 'ryan',
  };
}

export default function LOIForm({ onGenerate, isGenerating }) {
  const [form, setForm] = useState(getInitialFormData);
  const [errors, setErrors] = useState({});

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  }

  function handleCurrencyChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: parseCurrencyInput(value) }));
  }

  function handleModuleToggle(moduleId) {
    setForm(prev => ({
      ...prev,
      modules: prev.modules.includes(moduleId)
        ? prev.modules.filter(m => m !== moduleId)
        : [...prev.modules, moduleId],
    }));
    if (errors.modules) setErrors(prev => ({ ...prev, modules: '' }));
  }

  function handleToggleImplementation() {
    setForm(prev => ({
      ...prev,
      implementation: prev.implementation === 'yes' ? 'no' : 'yes',
    }));
  }

  function loadDemoData() {
    setForm(DEMO_DATA);
    setErrors({});
  }

  function validate() {
    const newErrors = {};
    if (!form.companyName.trim()) newErrors.companyName = 'Required';
    if (!form.companySegment) newErrors.companySegment = 'Required';
    if (!form.signorName.trim()) newErrors.signorName = 'Required';
    if (!form.signorEmail.trim()) newErrors.signorEmail = 'Required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.signorEmail)) newErrors.signorEmail = 'Invalid email';
    return newErrors;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const newErrors = validate();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const dealData = {
      ...form,
      subscriptionFee: form.subscriptionFee ? formatCurrency(form.subscriptionFee) : '',
      implementationFee: form.implementation === 'yes' ? formatCurrency(form.implementationFee) : '',
    };

    onGenerate(dealData);
  }

  function FieldError({ name }) {
    return errors[name] ? <p className="text-error text-xs mt-1">{errors[name]}</p> : null;
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4 sm:mb-6">
        <h2 className="text-base sm:text-lg font-semibold text-neutral-900">Deal Details</h2>
        <button type="button" onClick={loadDemoData} className="btn-secondary text-xs px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0">
          Load Demo Data
        </button>
      </div>

      {/* Section 1 — Company & Contact */}
      <div className="card p-4 sm:p-6 mb-4">
        <h3 className="text-sm font-semibold text-neutral-900 mb-4 uppercase tracking-wide">Company & Contact</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="form-label">Company Name *</label>
            <input name="companyName" value={form.companyName} onChange={handleChange} className="form-input" placeholder="e.g. Summit Truck Equipment" />
            <FieldError name="companyName" />
          </div>
          <div>
            <label className="form-label">Company Segment *</label>
            <select name="companySegment" value={form.companySegment} onChange={handleChange} className="form-input">
              <option value="">Select segment...</option>
              {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <FieldError name="companySegment" />
          </div>
          <div className="md:col-span-2">
            <label className="form-label">Company Description</label>
            <textarea
              name="companyDescription"
              value={form.companyDescription}
              onChange={handleChange}
              rows={3}
              className="form-input resize-none"
              placeholder="Brief description of the company and what they do."
            />
          </div>
          <div>
            <label className="form-label">Signor Name *</label>
            <input name="signorName" value={form.signorName} onChange={handleChange} className="form-input" placeholder="Full name of signer" />
            <FieldError name="signorName" />
          </div>
          <div>
            <label className="form-label">Signor Title</label>
            <input name="signorTitle" value={form.signorTitle} onChange={handleChange} className="form-input" placeholder="e.g. VP of Operations" />
          </div>
          <div className="md:col-span-2">
            <label className="form-label">Signor Email *</label>
            <input name="signorEmail" type="email" value={form.signorEmail} onChange={handleChange} className="form-input max-w-md" placeholder="email@example.com" />
            <FieldError name="signorEmail" />
          </div>
        </div>
      </div>

      {/* Section 2 — Platform Details */}
      <div className="card p-4 sm:p-6 mb-4" style={{ background: 'var(--neutral-50)' }}>
        <h3 className="text-sm font-semibold text-neutral-900 mb-4 uppercase tracking-wide">Platform Details</h3>
        <div className="mb-4">
          <label className="form-label">Platform Use Case</label>
          <textarea
            name="platformUseCase"
            value={form.platformUseCase}
            onChange={handleChange}
            rows={3}
            className="form-input resize-none"
            placeholder="Describe how this company will use SHAED. What problem does it solve for them?"
          />
        </div>
        <div>
          <label className="form-label">Modules Interested In</label>
          <div className="space-y-3 mt-1">
            {MODULES.map(mod => (
              <label
                key={mod.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors touch-manipulation ${
                  form.modules.includes(mod.id)
                    ? 'border-teal-primary bg-teal-primary/5'
                    : 'border-neutral-200 hover:border-neutral-700/20'
                }`}
              >
                <input
                  type="checkbox"
                  checked={form.modules.includes(mod.id)}
                  onChange={() => handleModuleToggle(mod.id)}
                  className="mt-0.5 w-4 h-4 sm:w-5 sm:h-5 accent-teal-primary flex-shrink-0"
                />
                <div className="min-w-0">
                  <span className="text-sm font-medium text-neutral-900">{mod.label}</span>
                  <span className="text-xs text-neutral-700 block sm:inline sm:ml-2">— {mod.desc}</span>
                </div>
              </label>
            ))}
          </div>
          <FieldError name="modules" />
        </div>
      </div>

      {/* Section 3 — Commercial Terms */}
      <div className="card p-4 sm:p-6 mb-4">
        <h3 className="text-sm font-semibold text-neutral-900 mb-4 uppercase tracking-wide">Commercial Terms</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="form-label">Subscription Fee</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-700 text-sm pointer-events-none">$</span>
              <input
                name="subscriptionFee"
                value={form.subscriptionFee}
                onChange={handleCurrencyChange}
                className="form-input input-currency"
                placeholder="500"
              />
            </div>
            {form.subscriptionFee && (
              <p className="text-xs text-neutral-700 mt-1">{formatCurrency(form.subscriptionFee)}/month</p>
            )}
          </div>
          <div>
            <label className="form-label">Discovery Session</label>
            <input name="discoveryPeriod" value={form.discoveryPeriod} onChange={handleChange} className="form-input" placeholder='e.g. "30 days", "60 days", "2 weeks"' />
          </div>
          <div>
            <label className="form-label">Implementation</label>
            <button
              type="button"
              onClick={handleToggleImplementation}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                form.implementation === 'yes' ? 'bg-teal-primary' : 'bg-neutral-200'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  form.implementation === 'yes' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="ml-2 text-sm text-neutral-700">
              {form.implementation === 'yes' ? 'Yes' : 'No'}
            </span>
          </div>
          {form.implementation === 'yes' && (
            <div
              className="transition-all duration-200 ease-in-out"
              style={{ animation: 'fadeIn 0.2s ease-in-out' }}
            >
              <label className="form-label">Implementation Fee</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-700 text-sm pointer-events-none">$</span>
                <input
                  name="implementationFee"
                  value={form.implementationFee}
                  onChange={handleCurrencyChange}
                  className="form-input input-currency"
                  placeholder="25000"
                />
              </div>
              {form.implementationFee && (
                <p className="text-xs text-neutral-700 mt-1">{formatCurrency(form.implementationFee)}</p>
              )}
              <FieldError name="implementationFee" />
            </div>
          )}
        </div>
      </div>

      {/* Section 4 — Additional Context */}
      <div className="card p-4 sm:p-6 mb-6" style={{ background: 'var(--neutral-50)' }}>
        <h3 className="text-sm font-semibold text-neutral-900 mb-4 uppercase tracking-wide">Additional Context</h3>
        <div className="mb-4">
          <label className="form-label">Other / Notes</label>
          <textarea
            name="other"
            value={form.other}
            onChange={handleChange}
            rows={4}
            className="form-input resize-none"
            placeholder="Any other context, event notes, relationship history, or special terms."
          />
        </div>
        <div>
          <label className="form-label">SHAED Signatory *</label>
          <select name="shaedSignatory" value={form.shaedSignatory} onChange={handleChange} className="form-input max-w-md">
            <option value="ryan">Ryan Pritchard — CEO & Co-Founder</option>
            <option value="eddie">Eddie Schick — COO & Co-Founder</option>
          </select>
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isGenerating}
        className="btn-primary w-full md:w-auto px-8 py-3 text-base flex items-center justify-center gap-2"
      >
        {isGenerating ? (
          <>
            <span className="spinner !w-5 !h-5 !border-2 !border-white/30 !border-t-white"></span>
            Generating your LOI with AI...
          </>
        ) : (
          'Generate LOI →'
        )}
      </button>
    </form>
  );
}
