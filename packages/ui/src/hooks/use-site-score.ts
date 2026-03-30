import { useState, useCallback, useRef } from 'react';
import type { SiteAnalysis, AnalysisOptions, ScoringError } from '@jamieblair/wind-site-intelligence-core';
import { analyseSite } from '@jamieblair/wind-site-intelligence-core';
import type { Result } from '@jamieblair/wind-site-intelligence-core';

interface UseSiteScoreState {
  analysis: SiteAnalysis | null;
  loading: boolean;
  error: ScoringError | null;
  analyse: (options: AnalysisOptions) => Promise<void>;
  reset: () => void;
}

export function useSiteScore(): UseSiteScoreState {
  const [analysis, setAnalysis] = useState<SiteAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ScoringError | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const analyse = useCallback(async (options: AnalysisOptions) => {
    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    const result: Result<SiteAnalysis, ScoringError> = await analyseSite({
      ...options,
      signal: controller.signal,
    });

    // Ignore results if this request was superseded
    if (controller.signal.aborted) return;

    if (result.ok) {
      setAnalysis(result.value);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setAnalysis(null);
    setError(null);
  }, []);

  return { analysis, loading, error, analyse, reset };
}
