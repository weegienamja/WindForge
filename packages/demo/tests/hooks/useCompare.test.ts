import { describe, expect, it, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCompare, snapshotId, type CompareSnapshot } from '../../src/hooks/useCompare';

function snap(lat: number, lng: number, composite = 70): CompareSnapshot {
  return {
    id: snapshotId(lat, lng),
    placeName: `Site ${lat},${lng}`,
    lat,
    lng,
    hub: 100,
    composite,
    windSpeedMs: 8,
    netAepMwh: 6000,
    lcoePerMwh: 55,
    hardConstraints: 0,
    savedAt: Date.now(),
  };
}

describe('useCompare', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('adds snapshots and reports membership', () => {
    const { result } = renderHook(() => useCompare());
    act(() => result.current.add(snap(58.2, -6.4)));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.has(snapshotId(58.2, -6.4))).toBe(true);
    expect(result.current.has(snapshotId(0, 0))).toBe(false);
  });

  it('refreshes an existing site in place rather than duplicating', () => {
    const { result } = renderHook(() => useCompare());
    act(() => result.current.add(snap(58.2, -6.4, 70)));
    act(() => result.current.add(snap(58.2, -6.4, 88)));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.composite).toBe(88);
  });

  it('caps the list at four sites, dropping the oldest', () => {
    const { result } = renderHook(() => useCompare());
    act(() => {
      result.current.add(snap(1, 1));
      result.current.add(snap(2, 2));
      result.current.add(snap(3, 3));
      result.current.add(snap(4, 4));
      result.current.add(snap(5, 5));
    });
    expect(result.current.items).toHaveLength(4);
    expect(result.current.has(snapshotId(1, 1))).toBe(false);
    expect(result.current.has(snapshotId(5, 5))).toBe(true);
  });

  it('removes and clears', () => {
    const { result } = renderHook(() => useCompare());
    act(() => {
      result.current.add(snap(1, 1));
      result.current.add(snap(2, 2));
    });
    act(() => result.current.remove(snapshotId(1, 1)));
    expect(result.current.items).toHaveLength(1);
    act(() => result.current.clear());
    expect(result.current.items).toHaveLength(0);
  });

  it('persists across hook instances via localStorage', () => {
    const first = renderHook(() => useCompare());
    act(() => first.result.current.add(snap(7, 7)));
    // Re-mount: a fresh hook should hydrate from storage.
    const second = renderHook(() => useCompare());
    expect(second.result.current.items.some((s) => s.id === snapshotId(7, 7))).toBe(true);
  });
});
