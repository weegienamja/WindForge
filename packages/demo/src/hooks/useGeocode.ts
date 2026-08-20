'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface GeocodeHit {
  displayName: string;
  lat: number;
  lng: number;
  category: string;
  label: string;
}

export interface UseGeocodeSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  results: GeocodeHit[];
  loading: boolean;
  clear: () => void;
}

/**
 * Debounced forward geocoding against `/api/geocode`. Updates `results` as the
 * user types (250 ms debounce); stale in-flight requests are discarded so the
 * dropdown always reflects the latest query.
 */
export function useGeocodeSearch(): UseGeocodeSearchReturn {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeHit[]>([]);
  const [loading, setLoading] = useState(false);
  const runIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const clear = useCallback(() => {
    runIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setResults([]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      clear();
      return;
    }
    const myId = ++runIdRef.current;
    const handle = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((data: { results?: GeocodeHit[] }) => {
          if (runIdRef.current !== myId) return;
          setResults(Array.isArray(data.results) ? data.results : []);
          setLoading(false);
        })
        .catch(() => {
          if (runIdRef.current !== myId) return;
          setResults([]);
          setLoading(false);
        });
    }, 250);
    return () => clearTimeout(handle);
  }, [query, clear]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { query, setQuery, results, loading, clear };
}

/**
 * Reverse-geocodes a coordinate to a human-readable place label via
 * `/api/geocode`. Returns `null` until a label resolves. Re-runs whenever the
 * rounded coordinate changes; stale responses are ignored.
 */
export function useReverseGeocode(
  coordinate: { lat: number; lng: number } | null,
): string | null {
  const [label, setLabel] = useState<string | null>(null);
  const runIdRef = useRef(0);

  // Round to ~100 m so tiny coordinate jitter doesn't trigger refetches.
  const key = coordinate
    ? `${coordinate.lat.toFixed(3)},${coordinate.lng.toFixed(3)}`
    : null;

  useEffect(() => {
    if (!coordinate || !key) {
      setLabel(null);
      return;
    }
    const myId = ++runIdRef.current;
    const controller = new AbortController();
    fetch(`/api/geocode?lat=${coordinate.lat}&lng=${coordinate.lng}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { label?: string; displayName?: string }) => {
        if (runIdRef.current !== myId) return;
        setLabel(data.label || data.displayName || null);
      })
      .catch(() => {
        if (runIdRef.current !== myId) return;
        setLabel(null);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return label;
}
