import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@jamieblair/windforge-core', async () => {
  const ok = <T>(value: T) => ({ ok: true as const, value });
  const err = <E>(error: E) => ({ ok: false as const, error });
  return {
    ok,
    err,
    analyseSite: vi.fn(),
  };
});

import { analyseSite } from '@jamieblair/windforge-core';
import { analyseSiteTool } from '../../src/tools/analyse-site.js';

const analyseSiteMock = analyseSite as unknown as ReturnType<typeof vi.fn>;

describe('analyse_site tool', () => {
  beforeEach(() => {
    analyseSiteMock.mockReset();
  });

  it('rejects out-of-range latitude', () => {
    const parsed = analyseSiteTool.inputSchema.safeParse({ lat: 999, lng: 0 });
    expect(parsed.success).toBe(false);
  });

  it('rejects unknown fields (strict)', () => {
    const parsed = analyseSiteTool.inputSchema.safeParse({ lat: 0, lng: 0, foo: 1 });
    expect(parsed.success).toBe(false);
  });

  it('forwards inputs to analyseSite and wraps the success result', async () => {
    analyseSiteMock.mockResolvedValueOnce({ ok: true, value: { compositeScore: 72 } });
    const out = await analyseSiteTool.handler({
      lat: 55.86,
      lng: -4.25,
      hubHeightM: 100,
    });
    expect(analyseSiteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        coordinate: { lat: 55.86, lng: -4.25 },
        hubHeightM: 100,
      }),
    );
    expect('ok' in out && out.ok).toBe(true);
    expect((out as { data: { compositeScore: number } }).data.compositeScore).toBe(72);
  });

  it('translates a core error into a tool error envelope', async () => {
    analyseSiteMock.mockResolvedValueOnce({
      ok: false,
      error: { code: 'DATA_FETCH_FAILED', message: 'NASA POWER unreachable' },
    });
    const out = await analyseSiteTool.handler({ lat: 0, lng: 0 });
    expect('error' in out).toBe(true);
    if ('error' in out) {
      expect(out.error.code).toBe('DATA_FETCH_FAILED');
      expect(out.error.message).toBe('NASA POWER unreachable');
    }
  });

  it('omits cdsApiKey from the call when not provided', async () => {
    analyseSiteMock.mockResolvedValueOnce({ ok: true, value: {} });
    await analyseSiteTool.handler({ lat: 1, lng: 2 });
    const callArg = analyseSiteMock.mock.calls[0][0] as Record<string, unknown>;
    expect('cdsApiKey' in callArg).toBe(false);
  });
});
