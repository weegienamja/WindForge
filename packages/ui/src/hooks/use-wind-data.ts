import { useState, useCallback, useEffect, useRef } from 'react';
import type { WindDataSummary, LatLng, ScoringError } from '@jamieblair/windforge-core';
import { fetchWindData } from '@jamieblair/windforge-core';
import type { Result } from '@jamieblair/windforge-core';

interface UseWindDataState {
  windData: WindDataSummary | null;
  loading: boolean;
  error: ScoringError | null;
  fetch: (coordinate: LatLng) => Promise<void>;
}

export function useWindData(): UseWindDataState {
  const [windData, setWindData] = useState<WindDataSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ScoringError | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const fetchData = useCallback(async (coordinate: LatLng) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    const result: Result<WindDataSummary, ScoringError> = await fetchWindData(
      coordinate,
      controller.signal,
    );
    if (controller.signal.aborted) return;

    if (result.ok) {
      setWindData(result.value);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, []);

  return { windData, loading, error, fetch: fetchData };
}
