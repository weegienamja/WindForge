'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ScoringErrorCode,
  type EnergyYieldResult,
  type MonthlyWindHistory,
  type ReconciledWindData,
  type ScoringError,
  type SiteAnalysis,
} from '@jamieblair/windforge-core';
import type {
  AnalysisApiError,
  AnalysisApiRequest,
  AnalysisApiResponse,
} from '../lib/analysis-api';

export type AnalyseStatus = 'idle' | 'running' | 'success' | 'error';

export interface AnalysisAuxiliaryState {
  status: AnalyseStatus;
  data: { raw: MonthlyWindHistory; corrected: MonthlyWindHistory | null } | null;
  reconciliation: ReconciledWindData | null;
  error: ScoringError | null;
}

export interface AepAuxiliaryState {
  status: AnalyseStatus;
  data: EnergyYieldResult | null;
  error: ScoringError | null;
}

export interface UseAnalyseResult {
  status: AnalyseStatus;
  data: SiteAnalysis | null;
  error: ScoringError | null;
  history: AnalysisAuxiliaryState;
  aep: AepAuxiliaryState;
  run: (options: AnalysisApiRequest) => Promise<void>;
  cancel: () => void;
}

export function useAnalyse(): UseAnalyseResult {
  const [status, setStatus] = useState<AnalyseStatus>('idle');
  const [payload, setPayload] = useState<AnalysisApiResponse | null>(null);
  const [error, setError] = useState<ScoringError | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);

  const cancel = useCallback(() => {
    runIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus('idle');
    setPayload(null);
    setError(null);
  }, []);

  const run = useCallback(async (options: AnalysisApiRequest) => {
    const runId = ++runIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('running');
    setPayload(null);
    setError(null);
    try {
      const response = await fetch('/api/analyse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(options),
        signal: controller.signal,
      });
      let body: AnalysisApiResponse | AnalysisApiError;
      try {
        body = (await response.json()) as AnalysisApiResponse | AnalysisApiError;
      } catch {
        throw new Error('Analysis service returned an invalid response.');
      }
      if (runIdRef.current !== runId) return;
      if (!body || typeof body !== 'object') {
        throw new Error('Analysis service returned an invalid response.');
      }
      if (!response.ok || 'error' in body) {
        setError(
          'error' in body && body.error
            ? body.error
            : { code: ScoringErrorCode.Unknown, message: 'Analysis failed.' },
        );
        setStatus('error');
        return;
      }
      setPayload(body);
      setStatus('success');
    } catch (cause) {
      if (runIdRef.current !== runId || controller.signal.aborted) return;
      setError({
        code: ScoringErrorCode.DataFetchFailed,
        message: cause instanceof Error ? cause.message : 'Analysis request failed.',
      });
      setStatus('error');
    } finally {
      if (runIdRef.current === runId) abortRef.current = null;
    }
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  return {
    status,
    data: payload?.analysis ?? null,
    error,
    history: {
      status:
        status === 'running'
          ? 'running'
          : payload?.windHistory
            ? 'success'
            : payload
              ? 'error'
              : 'idle',
      data: payload?.windHistory ?? null,
      reconciliation: null,
      error: payload && !payload.windHistory ? payload.auxiliaryErrors.windHistory : null,
    },
    aep: {
      status:
        status === 'running'
          ? 'running'
          : payload?.energyYield
            ? 'success'
            : payload
              ? 'error'
              : 'idle',
      data: payload?.energyYield ?? null,
      error: payload && !payload.energyYield ? payload.auxiliaryErrors.energyYield : null,
    },
    run,
    cancel,
  };
}
