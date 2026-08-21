import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScoringErrorCode } from '@jamieblair/windforge-core';
import { useAnalyse } from '../../src/hooks/useAnalyse';
import type { AnalysisApiResponse } from '../../src/lib/analysis-api';

const REQUEST = {
  coordinate: { lat: 55.86, lng: -4.25 },
  hubHeightM: 100,
  turbineId: 'vestas-v90-2mw',
};

const RESPONSE = {
  analysis: { coordinate: REQUEST.coordinate },
  windHistory: null,
  energyYield: null,
  auxiliaryErrors: {
    windHistory: { code: ScoringErrorCode.DataFetchFailed, message: 'History unavailable.' },
    energyYield: null,
  },
} as AnalysisApiResponse;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useAnalyse', () => {
  it('starts idle and sends one server-side analysis request', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(RESPONSE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const { result } = renderHook(() => useAnalyse());

    expect(result.current.status).toBe('idle');
    await act(() => result.current.run(REQUEST));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      '/api/analyse',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(REQUEST),
      }),
    );
    expect(result.current.status).toBe('success');
    expect(result.current.data?.coordinate).toEqual(REQUEST.coordinate);
    expect(result.current.history.status).toBe('error');
    expect(result.current.history.error?.message).toBe('History unavailable.');
  });

  it('surfaces structured API errors', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: ScoringErrorCode.InvalidCoordinate, message: 'Invalid input.' },
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      ),
    );
    const { result } = renderHook(() => useAnalyse());

    await act(() => result.current.run(REQUEST));

    expect(result.current.status).toBe('error');
    expect(result.current.error?.code).toBe(ScoringErrorCode.InvalidCoordinate);
  });

  it('reports a generic error for a non-JSON upstream response', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('<html>gateway error</html>', { status: 502 }));
    const { result } = renderHook(() => useAnalyse());

    await act(() => result.current.run(REQUEST));

    expect(result.current.status).toBe('error');
    expect(result.current.error).toEqual({
      code: ScoringErrorCode.DataFetchFailed,
      message: 'Analysis service returned an invalid response.',
    });
  });

  it('ignores a superseded response', async () => {
    let resolveFirst: ((response: Response) => void) | undefined;
    const first = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const newer = {
      ...RESPONSE,
      analysis: { ...RESPONSE.analysis, coordinate: { lat: 1, lng: 1 } },
    } as AnalysisApiResponse;
    vi.mocked(fetch)
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(new Response(JSON.stringify(newer), { status: 200 }));
    const { result } = renderHook(() => useAnalyse());

    act(() => {
      void result.current.run(REQUEST);
    });
    await act(async () => {
      await result.current.run({ ...REQUEST, coordinate: { lat: 1, lng: 1 } });
    });
    await waitFor(() => expect(result.current.status).toBe('success'));

    await act(async () => {
      resolveFirst?.(new Response(JSON.stringify(RESPONSE), { status: 200 }));
      await Promise.resolve();
    });
    expect(result.current.data?.coordinate).toEqual({ lat: 1, lng: 1 });
  });

  it('cancels an in-flight request and returns to idle', () => {
    vi.mocked(fetch).mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const { result } = renderHook(() => useAnalyse());

    act(() => {
      void result.current.run(REQUEST);
    });
    expect(result.current.status).toBe('running');
    act(() => result.current.cancel());

    expect(result.current.status).toBe('idle');
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
