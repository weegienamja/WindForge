'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'windforge:compare';
const MAX_ITEMS = 4;

export interface CompareSnapshot {
  /** Stable id derived from the rounded coordinate. */
  id: string;
  placeName: string | null;
  lat: number;
  lng: number;
  hub: number;
  composite: number;
  windSpeedMs: number | null;
  netAepMwh: number | null;
  lcoePerMwh: number | null;
  hardConstraints: number;
  savedAt: number;
}

export function snapshotId(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

function load(): CompareSnapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CompareSnapshot[]) : [];
  } catch {
    return [];
  }
}

function persist(items: CompareSnapshot[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore quota / privacy-mode errors — comparison is a convenience.
  }
}

export interface UseCompareReturn {
  items: CompareSnapshot[];
  add: (snapshot: CompareSnapshot) => void;
  remove: (id: string) => void;
  clear: () => void;
  has: (id: string) => boolean;
}

/**
 * Pinned-site comparison list, persisted to localStorage. Holds up to four
 * site snapshots; pinning the same coordinate again refreshes it in place.
 */
export function useCompare(): UseCompareReturn {
  const [items, setItems] = useState<CompareSnapshot[]>([]);

  // Hydrate after mount (avoids any SSR/client mismatch).
  useEffect(() => {
    setItems(load());
  }, []);

  const add = useCallback((snapshot: CompareSnapshot) => {
    setItems((prev) => {
      const without = prev.filter((s) => s.id !== snapshot.id);
      const next = [...without, snapshot].slice(-MAX_ITEMS);
      persist(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((s) => s.id !== id);
      persist(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    persist([]);
    setItems([]);
  }, []);

  const has = useCallback((id: string) => items.some((s) => s.id === id), [items]);

  return { items, add, remove, clear, has };
}
