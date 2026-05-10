'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  calculateAep,
  fetchWindData,
  ScoringErrorCode,
  type EnergyYieldResult,
  type LatLng,
  type ScoringError,
  type TurbineModel,
} from '@jamieblair/windforge-core';

export type AepStatus = 'idle' | 'running' | 'success' | 'error';

export interface UseAepReturn {
  status: AepStatus;
  data: EnergyYieldResult | null;
  error: ScoringError | null;
  run: (input: { coordinate: LatLng; turbine: TurbineModel; hubHeightM: number }) => void;
  reset: () => void;
}

/**
 * Fetches a wind data summary for the coordinate, then runs `calculateAep`
 * for the supplied turbine + hub height. Mirrors `useWindHistory`: stale
 * results from superseded runs are discarded, and a new run aborts the
 * in-flight request.
 */
export function useAep(): UseAepReturn {
  const [status, setStatus] = useState<AepStatus>('idle');
  const [data, setData] = useState<EnergyYieldResult | null>(null);
  const [error, setError] = useState<ScoringError | null>(null);

  const runIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    runIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus('idle');
    setData(null);
    setError(null);
  }, []);

  const run = useCallback<UseAepReturn['run']>((input) => {
    runIdRef.current += 1;
    const myId = runIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('running');
    setError(null);

    void fetchWindData(input.coordinate, controller.signal)
      .then((windResult) => {
        if (runIdRef.current !== myId) return;
        if (!windResult.ok) {
          setError(windResult.error);
          setStatus('error');
          return;
        }
        const aepResult = calculateAep(windResult.value, input.turbine, {
          hubHeightM: input.hubHeightM,
        });
        if (runIdRef.current !== myId) return;
        if (!aepResult.ok) {
          setError(aepResult.error);
          setStatus('error');
          return;
        }
        setData(aepResult.value);
        setStatus('success');
      })
      .catch((cause: unknown) => {
        if (runIdRef.current !== myId) return;
        const message = cause instanceof Error ? cause.message : 'AEP calculation failed';
        setError({ code: ScoringErrorCode.DataFetchFailed, message });
        setStatus('error');
      });
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { status, data, error, run, reset };
}
