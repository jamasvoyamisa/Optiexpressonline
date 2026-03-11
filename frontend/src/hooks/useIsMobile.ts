import { useState, useEffect } from 'react';

const BREAKPOINT = 768;

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < BREAKPOINT);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < BREAKPOINT);
    window.addEventListener('resize', handler, { passive: true });
    return () => window.removeEventListener('resize', handler);
  }, []);

  return isMobile;
}
