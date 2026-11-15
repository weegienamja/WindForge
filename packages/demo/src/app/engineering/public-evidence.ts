import { useEffect, useState } from 'react';

export function usePublicEvidence<T>(query: string) {
  const [result, setResult] = useState<{ query: string; data?: T; error?: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const res = await fetch('/api/engineering?' + query, { signal: controller.signal });
        if (!res.ok) throw Error('This evidence is unavailable for the selected revision.');
        const data = (await res.json()) as T;
        if (!controller.signal.aborted) setResult({ query, data });
      } catch (error) {
        if (!controller.signal.aborted)
          setResult({ query, error: error instanceof Error ? error.message : 'Retrieval failed.' });
      }
    }
    void load();
    return () => controller.abort();
  }, [query]);
  return result?.query === query ? result : null;
}
