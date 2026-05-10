'use client';

import { useEffect, useState } from 'react';

/**
 * Returns whether the given media query matches. SSR-safe: returns `false`
 * during the first render and updates after mount. Accessibility-friendly:
 * listens for `change` events on the MediaQueryList.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', update);
      return () => mql.removeEventListener('change', update);
    }
    // Legacy Safari / jsdom.
    mql.addListener(update);
    return () => mql.removeListener(update);
  }, [query]);

  return matches;
}
