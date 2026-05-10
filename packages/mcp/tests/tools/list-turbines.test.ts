import { describe, it, expect, vi } from 'vitest';

vi.mock('@jamieblair/windforge-core', () => ({
  getAllTurbines: vi.fn(() => [
    {
      id: 't1',
      manufacturer: 'Vestas',
      model: 'V112',
      ratedPowerKw: 3450,
      rotorDiameterM: 112,
      hubHeightOptionsM: [84, 94, 119],
      cutInSpeedMs: 3,
      ratedSpeedMs: 12,
      cutOutSpeedMs: 25,
      powerCurve: [],
    },
    {
      id: 't2',
      manufacturer: 'GE',
      model: '2.5-120',
      ratedPowerKw: 2500,
      rotorDiameterM: 120,
      hubHeightOptionsM: [85, 98, 110, 139],
      cutInSpeedMs: 3,
      ratedSpeedMs: 11,
      cutOutSpeedMs: 25,
      powerCurve: [],
    },
  ]),
}));

import { listTurbinesTool } from '../../src/tools/list-turbines.js';

describe('list_turbines tool', () => {
  it('accepts empty input', () => {
    const parsed = listTurbinesTool.inputSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it('rejects unknown fields', () => {
    const parsed = listTurbinesTool.inputSchema.safeParse({ foo: 1 });
    expect(parsed.success).toBe(false);
  });

  it('returns the library summarised', async () => {
    const out = await listTurbinesTool.handler({});
    expect('ok' in out && out.ok).toBe(true);
    if ('ok' in out && out.ok) {
      const data = out.data as { turbines: Array<{ id: string }>; count: number };
      expect(data.count).toBe(2);
      expect(data.turbines[0].id).toBe('t1');
    }
  });

  it('omits the power curve from the summary', async () => {
    const out = await listTurbinesTool.handler({});
    if ('ok' in out && out.ok) {
      const first = (out.data as { turbines: Array<Record<string, unknown>> }).turbines[0];
      expect('powerCurve' in first).toBe(false);
    }
  });
});
