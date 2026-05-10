import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReconciledWindHistory } from '@jamieblair/windforge-core';

// Mock fetchReconciledWindHistory before importing the hook.
const mockFetch = vi.fn();
vi.mock('@jamieblair/windforge-core', async () => {
  const actual =
    await vi.importActual<typeof import('@jamieblair/windforge-core')>(
      '@jamieblair/windforge-core',
    );
  return {
    ...actual,
    fetchReconciledWindHistory: (...args: unknown[]) => mockFetch(...args),
  };
});

// Import hook after mock declaration.
import { useWindHistory } from '../../src/hooks/useWindHistory';
import { ScoringErrorCode } from '@jamieblair/windforge-core';

const COORD = { lat: 55.86, lng: -4.25 };

function makeHistory(
  partial: Partial<ReconciledWindHistory> = {},
): ReconciledWindHistory {
  return {
    raw: {
      coordinate: COORD,
      records: [
        { year: 2023, month: 1, ws2m: 4, ws10m: 6, ws50m: 8, wd10m: 270, wd50m: 270 },
      ],
      startYear: 2023,
      endYear: 2023,
    },
    corrected: null,
    reconciliation: null,
    ...partial,
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  mockFetch.mockReset();
});

describe('useWindHistory', () => {
  it('starts in idle state', () => {
    const { result } = renderHook(() => useWindHistory());
    expect(result.current.status).toBe('idle');
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('transitions running → success on successful fetch', async () => {
    const history = makeHistory();
    mockFetch.mockResolvedValue({ ok: true, value: history });
    const { result } = renderHook(() => useWindHistory());

    act(() => {
      result.current.run(COORD);
    });
    expect(result.current.status).toBe('running');

    await waitFor(() => {
      expect(result.current.status).toBe('success');
    });
    expect(result.current.data?.raw).toBe(history.raw);
    expect(result.current.data?.corrected).toBeNull();
  });

  it('transitions running → error on failed fetch', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      error: { code: ScoringErrorCode.DataFetchFailed, message: 'Network down' },
    });
    const { result } = renderHook(() => useWindHistory());

    act(() => {
      result.current.run(COORD);
    });
    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.error?.message).toBe('Network down');
  });

  it('discards stale results when superseded', async () => {
    let resolveFirst: (value: { ok: true; value: ReconciledWindHistory }) => void = () => {};
    const firstPromise = new Promise<{ ok: true; value: ReconciledWindHistory }>(
      (resolve) => {
        resolveFirst = resolve;
      },
    );
    const second = makeHistory({
      raw: {
        coordinate: { lat: 1, lng: 1 },
        records: [],
        startYear: 2024,
        endYear: 2024,
      },
    });

    mockFetch.mockReturnValueOnce(firstPromise).mockResolvedValueOnce({
      ok: true,
      value: second,
    });

    const { result } = renderHook(() => useWindHistory());

    act(() => {
      result.current.run(COORD);
    });
    act(() => {
      result.current.run({ lat: 1, lng: 1 });
    });

    await waitFor(() => {
      expect(result.current.status).toBe('success');
    });
    expect(result.current.data?.raw.startYear).toBe(2024);

    // Now resolve the stale first request. State must not change back.
    await act(async () => {
      resolveFirst({ ok: true, value: makeHistory() });
      await Promise.resolve();
    });
    expect(result.current.data?.raw.startYear).toBe(2024);
  });

  it('reset clears state and aborts in-flight requests', async () => {
    mockFetch.mockResolvedValue({ ok: true, value: makeHistory() });
    const { result } = renderHook(() => useWindHistory());

    act(() => {
      result.current.run(COORD);
    });
    await waitFor(() => {
      expect(result.current.status).toBe('success');
    });

    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBe('idle');
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('passes the years option through to the fetcher', async () => {
    mockFetch.mockResolvedValue({ ok: true, value: makeHistory() });
    const { result } = renderHook(() => useWindHistory());

    act(() => {
      result.current.run(COORD, { years: 5 });
    });
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    const call = mockFetch.mock.calls[0];
    expect(call?.[0]).toEqual(COORD);
    expect(call?.[1]).toMatchObject({ yearsBack: 5 });
  });
});
