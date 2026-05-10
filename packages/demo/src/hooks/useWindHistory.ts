'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchReconciledWindHistory,
  ScoringErrorCode,
  type LatLng,
  type MonthlyWindHistory,
  type ReconciledWindHistory,
  type ScoringError,
} from '@jamieblair/windforge-core';

export type WindHistoryStatus = 'idle' | 'running' | 'success' | 'error';

export interface UseWindHistoryReturn {
  status: WindHistoryStatus;
  data: { raw: MonthlyWindHistory; corrected: MonthlyWindHistory | null } | null;
  reconciliation: ReconciledWindHistory['reconciliation'] | null;
  error: ScoringError | null;
  run: (coordinate: LatLng, options?: { years?: number }) => void;
  reset: () => void;
}

/**
 * Fetches monthly wind history (raw NASA POWER + bias-corrected when CDS
 * credentials are present) for the given coordinate. Mirrors the shape of
 * `useAnalyse` so the analyse page can drive both hooks in lockstep.
 *
 * Cancellation: a new `run` aborts the in-flight request and discards any
 * stale result that arrives afterwards.
 */
export function useWindHistory(): UseWindHistoryReturn {
  const [status, setStatus] = useState<WindHistoryStatus>('idle');
  const [data, setData] = useState<UseWindHistoryReturn['data']>(null);
  const [reconciliation, setReconciliation] =
    useState<ReconciledWindHistory['reconciliation'] | null>(null);
  const [error, setError] = useState<ScoringError | null>(null);

  // Track the latest run so stale results can be discarded.
  const runIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    runIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus('idle');
    setData(null);
    setReconciliation(null);
    setError(null);
  }, []);

  const run = useCallback(
    (coordinate: LatLng, options?: { years?: number }) => {
      runIdRef.current += 1;
      const myId = runIdRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus('running');
      setError(null);

      void fetchReconciledWindHistory(coordinate, {
        signal: controller.signal,
        ...(options?.years !== undefined ? { yearsBack: options.years } : {}),
      })
        .then((result) => {
          // Discard stale results.
          if (runIdRef.current !== myId) return;
          if (!result.ok) {
            setError(result.error);
            setStatus('error');
            return;
          }
          setData({ raw: result.value.raw, corrected: result.value.corrected });
          setReconciliation(result.value.reconciliation);
          setStatus('success');
        })
        .catch((cause: unknown) => {
          if (runIdRef.current !== myId) return;
          const message = cause instanceof Error ? cause.message : 'Wind history fetch failed';
          setError({
            code: ScoringErrorCode.DataFetchFailed,
            message,
          });
          setStatus('error');
        });
    },
    [],
  );

  // Abort on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { status, data, reconciliation, error, run, reset };
}
