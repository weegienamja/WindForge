/**
 * Integration smoke tests for the WindForge MCP tools.
 *
 * These call the real core engine which fetches from live external APIs:
 *   - NASA POWER (always)
 *   - Open-Elevation (always)
 *   - OpenStreetMap Overpass (analyse_site, assess_site_polygon, detect_constraints)
 *   - ERA5 / CERRA via Copernicus CDS (only when CDS_API_KEY is set)
 *
 * Run with: `pnpm test:integration`
 *
 * Skip individual suites by setting WINDFORGE_SKIP_LIVE=1 (CI-friendly default).
 */

import { describe, it, expect } from 'vitest';
import { listTurbinesTool } from '../../src/tools/list-turbines.js';
import { analyseSiteTool } from '../../src/tools/analyse-site.js';
import { fetchWindHistoryTool } from '../../src/tools/fetch-wind-history.js';

const skipLive = process.env.WINDFORGE_SKIP_LIVE === '1';
const liveDescribe = skipLive ? describe.skip : describe;

describe('list_turbines (offline)', () => {
  it('returns the real built-in library', async () => {
    const out = await listTurbinesTool.handler({});
    expect('ok' in out && out.ok).toBe(true);
    if ('ok' in out && out.ok) {
      const data = out.data as { turbines: unknown[]; count: number };
      expect(data.count).toBeGreaterThan(0);
      expect(data.turbines.length).toBe(data.count);
    }
  });
});

liveDescribe('analyse_site (live)', () => {
  it('produces a real composite score for Glasgow', async () => {
    const out = await analyseSiteTool.handler({ lat: 55.86, lng: -4.25 });
    expect('ok' in out && out.ok).toBe(true);
    if ('ok' in out && out.ok) {
      const data = out.data as { compositeScore: number; factors: unknown[] };
      expect(data.compositeScore).toBeGreaterThanOrEqual(0);
      expect(data.compositeScore).toBeLessThanOrEqual(100);
      expect(data.factors.length).toBe(6);
    }
  });
});

liveDescribe('fetch_wind_history (live)', () => {
  it('returns NASA POWER monthly history for Durness', async () => {
    const out = await fetchWindHistoryTool.handler({ lat: 58.21, lng: -5.03, years: 2 });
    expect('ok' in out && out.ok).toBe(true);
    if ('ok' in out && out.ok) {
      const data = out.data as { records: unknown[] };
      expect(data.records.length).toBeGreaterThan(0);
    }
  });
});
