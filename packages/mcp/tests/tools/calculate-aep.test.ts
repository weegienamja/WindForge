import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@jamieblair/windforge-core', () => ({
  calculateAep: vi.fn(),
  fetchWindData: vi.fn(),
  getTurbineById: vi.fn(),
}));

import { calculateAep, fetchWindData, getTurbineById } from '@jamieblair/windforge-core';
import { calculateAepTool } from '../../src/tools/calculate-aep.js';

const calculateAepMock = calculateAep as unknown as ReturnType<typeof vi.fn>;
const fetchWindDataMock = fetchWindData as unknown as ReturnType<typeof vi.fn>;
const getTurbineByIdMock = getTurbineById as unknown as ReturnType<typeof vi.fn>;

const fakeTurbine = {
  id: 'fake-2.5',
  manufacturer: 'Fake',
  model: 'F25',
  ratedPowerKw: 2500,
  rotorDiameterM: 100,
  hubHeightOptionsM: [80, 100],
  cutInSpeedMs: 3,
  ratedSpeedMs: 12,
  cutOutSpeedMs: 25,
  powerCurve: [],
};

describe('calculate_aep tool', () => {
  beforeEach(() => {
    calculateAepMock.mockReset();
    fetchWindDataMock.mockReset();
    getTurbineByIdMock.mockReset();
  });

  it('rejects when turbineId is missing', () => {
    const parsed = calculateAepTool.inputSchema.safeParse({ lat: 0, lng: 0 });
    expect(parsed.success).toBe(false);
  });

  it('returns TURBINE_NOT_FOUND for unknown turbines', async () => {
    getTurbineByIdMock.mockReturnValueOnce(undefined);
    const out = await calculateAepTool.handler({ lat: 0, lng: 0, turbineId: 'nope' });
    expect('error' in out && out.error.code).toBe('TURBINE_NOT_FOUND');
    expect(fetchWindDataMock).not.toHaveBeenCalled();
  });

  it('propagates wind-data fetch errors', async () => {
    getTurbineByIdMock.mockReturnValueOnce(fakeTurbine);
    fetchWindDataMock.mockResolvedValueOnce({
      ok: false,
      error: { code: 'DATA_FETCH_FAILED', message: 'down' },
    });
    const out = await calculateAepTool.handler({ lat: 0, lng: 0, turbineId: 'fake-2.5' });
    expect('error' in out && out.error.code).toBe('DATA_FETCH_FAILED');
  });

  it('returns AEP success on happy path', async () => {
    getTurbineByIdMock.mockReturnValueOnce(fakeTurbine);
    fetchWindDataMock.mockResolvedValueOnce({ ok: true, value: { annualAverageSpeedMs: 7 } });
    calculateAepMock.mockReturnValueOnce({ ok: true, value: { netAepKwh: 8_000_000 } });
    const out = await calculateAepTool.handler({ lat: 0, lng: 0, turbineId: 'fake-2.5' });
    expect('ok' in out && out.ok).toBe(true);
    if ('ok' in out && out.ok) {
      expect((out.data as { netAepKwh: number }).netAepKwh).toBe(8_000_000);
    }
  });
});
