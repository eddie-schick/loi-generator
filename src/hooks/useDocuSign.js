import { useState, useEffect } from 'react';

export default function useDocuSign() {
  const [isConnected, setIsConnected] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Check if we just came back from DocuSign OAuth
    const params = new URLSearchParams(window.location.search);
    if (params.get('docusign') === 'connected') {
      setIsConnected(true);
      setIsChecking(false);
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    // Check auth status via server
    async function checkAuth() {
      try {
        const res = await fetch('/api/docusign-status');
        if (res.ok) {
          const data = await res.json();
          setIsConnected(data.authenticated);
        }
      } catch {
        // Not connected
      } finally {
        setIsChecking(false);
      }
    }

    checkAuth();
  }, []);

  return { isConnected, isChecking };
}
