import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScoringErrorCode } from '@jamieblair/windforge-core';

const mocks = vi.hoisted(() => ({
  analyseSite: vi.fn(),
  calculateAep: vi.fn(),
  fetchMonthlyWindHistory: vi.fn(),
  getTurbineById: vi.fn(),
}));

vi.mock('@jamieblair/windforge-core', async () => {
  const actual = await vi.importActual<typeof import('@jamieblair/windforge-core')>(
    '@jamieblair/windforge-core',
  );
  return { ...actual, ...mocks };
});

import { POST } from '../src/app/api/analyse/route';

const INPUT = {
  coordinate: { lat: 55.86, lng: -4.25 },
  hubHeightM: 100,
  turbineId: 'test-turbine',
};

function request(body: string | object, headers?: HeadersInit): Request {
  return new Request('http://localhost/api/analyse', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTurbineById.mockReturnValue({ id: 'test-turbine' });
  mocks.analyseSite.mockResolvedValue({
    ok: true,
    value: {
      coordinate: INPUT.coordinate,
      metadata: { windShearAlpha: 0.14 },
      windResource: { resolved: { meanWindSpeedMs: 8 } },
    },
  });
  mocks.fetchMonthlyWindHistory.mockResolvedValue({
    ok: true,
    value: { coordinate: INPUT.coordinate, records: [], startYear: 2024, endYear: 2024 },
  });
  mocks.calculateAep.mockReturnValue({ ok: true, value: { netAepMwh: 1234 } });
});

describe('POST /api/analyse', () => {
  it('rejects malformed JSON and invalid input', async () => {
    expect((await POST(request('{'))).status).toBe(400);
    expect((await POST(request({ ...INPUT, hubHeightM: 90 }))).status).toBe(400);
    expect(mocks.analyseSite).not.toHaveBeenCalled();
  });

  it('enforces the body limit without relying on Content-Length', async () => {
    const response = await POST(request(JSON.stringify({ ...INPUT, padding: 'x'.repeat(2_100) })));
    expect(response.status).toBe(413);
    expect(mocks.analyseSite).not.toHaveBeenCalled();
  });

  it('stops reading a streamed body as soon as the byte limit is exceeded', async () => {
    let reads = 0;
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          reads++;
          controller.enqueue(new TextEncoder().encode('x'.repeat(3_000)));
          if (reads === 3) controller.close();
        },
        cancel,
      },
      { highWaterMark: 0 },
    );
    const req = new Request('http://localhost/api/analyse', {
      method: 'POST',
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    expect((await POST(req)).status).toBe(413);
    expect(reads).toBe(1);
    expect(cancel).toHaveBeenCalled();
    expect(mocks.analyseSite).not.toHaveBeenCalled();
  });

  it('rejects unknown turbine identifiers', async () => {
    mocks.getTurbineById.mockReturnValue(undefined);
    const response = await POST(request(INPUT));
    expect(response.status).toBe(400);
  });

  it('uses the canonical analysed wind resource for AEP', async () => {
    const response = await POST(request(INPUT));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.analyseSite).toHaveBeenCalledTimes(1);
    expect(mocks.fetchMonthlyWindHistory).toHaveBeenCalledTimes(1);
    expect(mocks.calculateAep).toHaveBeenCalledWith(
      { meanWindSpeedMs: 8 },
      { id: 'test-turbine' },
      { hubHeightM: 100, windShearAlpha: 0.14 },
    );
    expect(payload.energyYield.netAepMwh).toBe(1234);
  });

  it('returns partial auxiliary data explicitly when history fails', async () => {
    mocks.fetchMonthlyWindHistory.mockResolvedValue({
      ok: false,
      error: { code: ScoringErrorCode.DataFetchFailed, message: 'History unavailable.' },
    });
    const response = await POST(request(INPUT));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.windHistory).toBeNull();
    expect(payload.auxiliaryErrors.windHistory).toEqual({
      code: ScoringErrorCode.DataFetchFailed,
      message: 'History unavailable.',
    });
    expect(payload.auxiliaryErrors.energyYield).toBeNull();
  });

  it('attributes an AEP failure separately from wind-history failure', async () => {
    mocks.calculateAep.mockReturnValue({
      ok: false,
      error: { code: ScoringErrorCode.InsufficientData, message: 'AEP unavailable.' },
    });
    const response = await POST(request(INPUT));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.windHistory).not.toBeNull();
    expect(payload.energyYield).toBeNull();
    expect(payload.auxiliaryErrors).toEqual({
      windHistory: null,
      energyYield: {
        code: ScoringErrorCode.InsufficientData,
        message: 'AEP unavailable.',
      },
    });
  });

  it('does not expose unexpected exception messages', async () => {
    mocks.analyseSite.mockRejectedValue(new Error('internal-sensitive-detail'));
    const response = await POST(request(INPUT));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error.message).toBe('Analysis failed unexpectedly.');
  });
});
