import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@jamieblair/windforge-core', () => ({
  fetchMonthlyWindHistory: vi.fn(),
}));

import { fetchMonthlyWindHistory } from '@jamieblair/windforge-core';
import { fetchWindHistoryTool } from '../../src/tools/fetch-wind-history.js';

const fetchMonthlyMock = fetchMonthlyWindHistory as unknown as ReturnType<typeof vi.fn>;

describe('fetch_wind_history tool', () => {
  beforeEach(() => {
    fetchMonthlyMock.mockReset();
  });

  it('rejects out-of-range years', () => {
    const parsed = fetchWindHistoryTool.inputSchema.safeParse({ lat: 0, lng: 0, years: 100 });
    expect(parsed.success).toBe(false);
  });

  it('uses default years (10) when omitted', async () => {
    fetchMonthlyMock.mockResolvedValueOnce({ ok: true, value: { records: [] } });
    await fetchWindHistoryTool.handler({ lat: 55, lng: -4 });
    expect(fetchMonthlyMock).toHaveBeenCalledWith({ lat: 55, lng: -4 }, undefined);
  });

  it('forwards explicit years to the core function', async () => {
    fetchMonthlyMock.mockResolvedValueOnce({ ok: true, value: { records: [] } });
    await fetchWindHistoryTool.handler({ lat: 55, lng: -4, years: 20 });
    expect(fetchMonthlyMock).toHaveBeenCalledWith({ lat: 55, lng: -4 }, 20);
  });

  it('propagates fetch errors', async () => {
    fetchMonthlyMock.mockResolvedValueOnce({
      ok: false,
      error: { code: 'TIMEOUT', message: 'NASA POWER timed out' },
    });
    const out = await fetchWindHistoryTool.handler({ lat: 0, lng: 0 });
    expect('error' in out && out.error.code).toBe('TIMEOUT');
  });
});
