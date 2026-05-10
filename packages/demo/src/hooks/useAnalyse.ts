'use client';

import { useCallback, useMemo, useState } from 'react';
import type { AnalysisOptions, SiteAnalysis, ScoringError } from '@jamieblair/windforge-core';
import { useSiteScore } from '@jamieblair/windforge';

export type AnalyseStatus = 'idle' | 'running' | 'success' | 'error';

export interface UseAnalyseResult {
  status: AnalyseStatus;
  data: SiteAnalysis | null;
  error: ScoringError | null;
  run: (options: AnalysisOptions) => Promise<void>;
  cancel: () => void;
}

/**
 * Thin wrapper around `useSiteScore` that exposes a single `status` enum
 * and a stable `run` / `cancel` API for the analyse page. Cancelling
 * relies on the underlying hook's AbortController (it aborts when reset).
 */
export function useAnalyse(): UseAnalyseResult {
  const { analysis, loading, error, analyse, reset } = useSiteScore();
  const [hasRun, setHasRun] = useState(false);

  const run = useCallback(
    async (options: AnalysisOptions) => {
      setHasRun(true);
      await analyse(options);
    },
    [analyse],
  );

  const cancel = useCallback(() => {
    reset();
    setHasRun(false);
  }, [reset]);

  const status: AnalyseStatus = useMemo(() => {
    if (loading) return 'running';
    if (error) return 'error';
    if (analysis) return 'success';
    if (hasRun) return 'idle';
    return 'idle';
  }, [loading, error, analysis, hasRun]);

  return { status, data: analysis, error, run, cancel };
}
