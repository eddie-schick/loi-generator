import { useState } from 'react';

// Logo/icon in public/ folder (spaces URL-encoded)
const LOGO_PNG = '/SHAED%20Logo%20-%20Updated.png';
const LOGO_SVG = '/SHAED%20Logo.svg';
const ICON_PNG = '/SHAED%20Icon%20-%20Updated.png';

export default function Header() {
  const [logoSrc, setLogoSrc] = useState(LOGO_PNG);
  const [logoError, setLogoError] = useState(false);

  const handleLogoError = () => {
    if (logoSrc === LOGO_PNG) {
      setLogoSrc(LOGO_SVG);
    } else if (logoSrc === LOGO_SVG) {
      setLogoSrc(ICON_PNG); // use icon as fallback if logo missing
    } else {
      setLogoError(true);
    }
  };

  return (
    <header className="bg-white border-b border-neutral-200 px-4 py-3 sm:px-6 sm:py-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center min-w-0 flex-shrink">
          {logoError ? (
            <span className="text-xl sm:text-3xl font-bold tracking-tight truncate" style={{ color: '#3B8C7D' }}>SHAED</span>
          ) : (
            <img
              src={logoSrc}
              alt="SHAED"
              className="h-9 w-auto sm:h-12"
              style={{ maxHeight: '52px' }}
              onError={handleLogoError}
            />
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs sm:text-sm text-neutral-700 font-medium whitespace-nowrap">LOI Generator</span>
        </div>
      </div>
    </header>
  );
}
