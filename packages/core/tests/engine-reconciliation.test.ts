import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from '../src/types/result.js';
import { ScoringErrorCode, scoringError } from '../src/types/errors.js';
import type {
  WindDataSummary,
  MonthlyWindHistory,
  MonthlyWindRecord,
} from '../src/types/datasources.js';

// Mock all datasource modules so analyseSite is purely deterministic.
vi.mock('../src/datasources/nasa-power.js', () => ({
  fetchWindData: vi.fn(),
  fetchMonthlyWindHistory: vi.fn(),
}));
vi.mock('../src/datasources/open-elevation.js', () => ({
  fetchElevationData: vi.fn(),
}));
vi.mock('../src/datasources/osm-overpass.js', () => ({
  fetchGridInfrastructure: vi.fn(),
  fetchLandUse: vi.fn(),
  fetchRoadAccess: vi.fn(),
  fetchNearbyWindFarms: vi.fn(),
}));
vi.mock('../src/datasources/nominatim.js', () => ({
  reverseGeocode: vi.fn(),
}));
vi.mock('../src/datasources/era5.js', () => ({
  fetchEra5MonthlyHistory: vi.fn(),
}));
vi.mock('../src/datasources/cerra.js', () => ({
  fetchCerraMonthlyHistory: vi.fn(),
  isInCerraDomain: vi.fn(),
}));

import { analyseSite } from '../src/scoring/engine.js';
import { fetchWindData, fetchMonthlyWindHistory } from '../src/datasources/nasa-power.js';
import { fetchElevationData } from '../src/datasources/open-elevation.js';
import {
  fetchGridInfrastructure,
  fetchLandUse,
  fetchRoadAccess,
  fetchNearbyWindFarms,
} from '../src/datasources/osm-overpass.js';
import { reverseGeocode } from '../src/datasources/nominatim.js';
import { fetchEra5MonthlyHistory } from '../src/datasources/era5.js';
import { fetchCerraMonthlyHistory, isInCerraDomain } from '../src/datasources/cerra.js';

const COORD = { lat: 55.7644, lng: -4.1770 };

function makeSummary(meanMs: number, dataYears = 1): WindDataSummary {
  return {
    coordinate: COORD,
    monthlyAverages: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      averageSpeedMs: meanMs,
      averageDirectionDeg: 240,
    })),
    annualAverageSpeedMs: meanMs,
    speedStdDevMs: 1.2,
    prevailingDirectionDeg: 240,
    directionalConsistency: 0.7,
    dataYears,
    referenceHeightM: 50,
  };
}

function makeHistory(meanMs: number, months = 36, startYear = 2020): MonthlyWindHistory {
  const records: MonthlyWindRecord[] = [];
  for (let i = 0; i < months; i++) {
    const year = startYear + Math.floor(i / 12);
    const month = (i % 12) + 1;
    records.push({
      year,
      month,
      ws2m: meanMs * 0.5,
      ws10m: meanMs * 0.8,
      ws50m: meanMs,
      wd10m: 240,
      wd50m: 240,
      wsHubHeight: meanMs * 1.1,
    });
  }
  return {
    coordinate: COORD,
    records,
    startYear,
    endYear: startYear + Math.ceil(months / 12) - 1,
    hubHeightM: 80,
    windShearAlpha: 0.14,
    totalMonths: months,
  };
}

function setupHappyPathMocks(): void {
  vi.mocked(fetchWindData).mockResolvedValue(ok(makeSummary(7.0, 1)));
  vi.mocked(fetchMonthlyWindHistory).mockResolvedValue(ok(makeHistory(7.0, 36)));
  vi.mocked(fetchElevationData).mockResolvedValue(
    ok({
      coordinate: COORD,
      elevationM: 120,
      slopePercent: 5,
      aspectDeg: 180,
      roughnessClass: 1,
    }),
  );
  vi.mocked(fetchGridInfrastructure).mockResolvedValue(
    ok({
      nearestLineDistanceKm: 8,
      nearestSubstationDistanceKm: 12,
      lineCount: 2,
      substationCount: 1,
      searchRadiusKm: 50,
    }),
  );
  vi.mocked(fetchLandUse).mockResolvedValue(
    ok({
      hardConstraints: [],
      softConstraints: [],
      positiveIndicators: [{ tag: 'landuse=farmland', distanceM: 0 }],
      detail: 'Farmland',
    }),
  );
  vi.mocked(fetchRoadAccess).mockResolvedValue(
    ok({
      bestRoadCategory: 'primary',
      nearestRoadName: 'A838',
      nearestRoadDistanceKm: 1.2,
      secondaryCount: 3,
      detail: 'Primary road 1.2km',
    }),
  );
  vi.mocked(fetchNearbyWindFarms).mockResolvedValue(
    ok({ count: 1, nearestDistanceKm: 12 }),
  );
  vi.mocked(reverseGeocode).mockResolvedValue(
    ok({ countryCode: 'GB', displayName: 'East Kilbride' }),
  );
}

describe('analyseSite reanalysis reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not include reconciliation metadata when no reanalysis sources are provided', async () => {
    setupHappyPathMocks();

    const result = await analyseSite({ coordinate: COORD });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.metadata.reconciliation).toBeUndefined();
    // NASA history fetch should not have been called when no reanalysis is provided.
    expect(fetchMonthlyWindHistory).not.toHaveBeenCalled();
    expect(result.value.metadata.sourcesUsed).not.toContain('CERRA');
    expect(result.value.metadata.sourcesUsed).not.toContain('ERA5');
  });

  it('reconciles against ERA5 when only ERA5 is provided', async () => {
    setupHappyPathMocks();

    const era5Summary = makeSummary(7.5, 5);
    const era5History = makeHistory(7.5, 36);

    const result = await analyseSite({
      coordinate: COORD,
      reanalysis: { era5: { summary: era5Summary, history: era5History } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.metadata.reconciliation).toBeDefined();
    expect(result.value.metadata.reconciliation?.reference).toBe('era5');
    expect(result.value.metadata.sourcesUsed).toContain('ERA5');
    expect(fetchMonthlyWindHistory).toHaveBeenCalledOnce();
  });

  it('prefers CERRA over ERA5 when both are provided', async () => {
    setupHappyPathMocks();

    const era5Summary = makeSummary(7.5, 5);
    const era5History = makeHistory(7.5, 36);
    const cerraSummary = makeSummary(7.2, 5);
    const cerraHistory = makeHistory(7.2, 36);

    const result = await analyseSite({
      coordinate: COORD,
      reanalysis: {
        era5: { summary: era5Summary, history: era5History },
        cerra: { summary: cerraSummary, history: cerraHistory },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.metadata.reconciliation?.reference).toBe('cerra');
    expect(result.value.metadata.sourcesUsed).toContain('CERRA');
    expect(result.value.metadata.sourcesUsed).not.toContain('ERA5');
  });

  it('falls back gracefully when NASA history fetch fails', async () => {
    setupHappyPathMocks();
    vi.mocked(fetchMonthlyWindHistory).mockResolvedValue(
      err(scoringError(ScoringErrorCode.DataFetchFailed, 'fail')),
    );

    const era5Summary = makeSummary(7.5, 5);
    const era5History = makeHistory(7.5, 36);

    const result = await analyseSite({
      coordinate: COORD,
      reanalysis: { era5: { summary: era5Summary, history: era5History } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // No reconciliation metadata, but analysis still completes.
    expect(result.value.metadata.reconciliation).toBeUndefined();
    expect(result.value.factors.length).toBeGreaterThan(0);
  });
});

describe('analyseSite auto-fetch reanalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CDS_API_KEY;
    vi.mocked(isInCerraDomain).mockReturnValue(true);
  });

  it('does not call ERA5/CERRA when no CDS API key is configured', async () => {
    setupHappyPathMocks();
    const result = await analyseSite({ coordinate: COORD });
    expect(result.ok).toBe(true);
    expect(fetchEra5MonthlyHistory).not.toHaveBeenCalled();
    expect(fetchCerraMonthlyHistory).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.value.metadata.reanalysisAttempted).toBeUndefined();
    }
  });

  it('auto-fetches ERA5 when CDS key set and skips CERRA when out of area', async () => {
    setupHappyPathMocks();
    vi.mocked(isInCerraDomain).mockReturnValue(false);
    vi.mocked(fetchEra5MonthlyHistory).mockResolvedValue(
      ok({ summary: makeSummary(7.5, 5), history: makeHistory(7.5, 36) }),
    );

    const result = await analyseSite({ coordinate: COORD, cdsApiKey: 'k' });
    expect(result.ok).toBe(true);
    expect(fetchEra5MonthlyHistory).toHaveBeenCalledOnce();
    expect(fetchCerraMonthlyHistory).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.value.metadata.reanalysisAttempted).toEqual(['era5']);
      expect(result.value.metadata.reanalysisSucceeded).toEqual(['era5']);
      expect(result.value.metadata.reconciliation?.reference).toBe('era5');
    }
  });

  it('auto-fetches both ERA5 and CERRA in-area, prefers CERRA', async () => {
    setupHappyPathMocks();
    vi.mocked(isInCerraDomain).mockReturnValue(true);
    vi.mocked(fetchEra5MonthlyHistory).mockResolvedValue(
      ok({ summary: makeSummary(7.5, 5), history: makeHistory(7.5, 36) }),
    );
    vi.mocked(fetchCerraMonthlyHistory).mockResolvedValue(
      ok({ summary: makeSummary(7.2, 5), history: makeHistory(7.2, 36) }),
    );

    const result = await analyseSite({ coordinate: COORD, cdsApiKey: 'k' });
    expect(result.ok).toBe(true);
    expect(fetchEra5MonthlyHistory).toHaveBeenCalledOnce();
    expect(fetchCerraMonthlyHistory).toHaveBeenCalledOnce();
    if (result.ok) {
      expect(result.value.metadata.reanalysisAttempted?.sort()).toEqual(['cerra', 'era5']);
      expect(result.value.metadata.reanalysisSucceeded?.sort()).toEqual(['cerra', 'era5']);
      expect(result.value.metadata.reconciliation?.reference).toBe('cerra');
    }
  });

  it('continues with ERA5 when CERRA fetch fails', async () => {
    setupHappyPathMocks();
    vi.mocked(isInCerraDomain).mockReturnValue(true);
    vi.mocked(fetchEra5MonthlyHistory).mockResolvedValue(
      ok({ summary: makeSummary(7.5, 5), history: makeHistory(7.5, 36) }),
    );
    vi.mocked(fetchCerraMonthlyHistory).mockResolvedValue(
      err(scoringError(ScoringErrorCode.Timeout, 'CDS timeout')),
    );

    const result = await analyseSite({ coordinate: COORD, cdsApiKey: 'k' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.reanalysisSucceeded).toEqual(['era5']);
      expect(result.value.metadata.reconciliation?.reference).toBe('era5');
      expect(result.value.metadata.sourcesFailed).toContain('CERRA');
    }
  });

  it('completes analysis even when both reanalysis fetches fail', async () => {
    setupHappyPathMocks();
    vi.mocked(isInCerraDomain).mockReturnValue(true);
    vi.mocked(fetchEra5MonthlyHistory).mockResolvedValue(
      err(scoringError(ScoringErrorCode.DataFetchFailed, 'CDS rejected')),
    );
    vi.mocked(fetchCerraMonthlyHistory).mockResolvedValue(
      err(scoringError(ScoringErrorCode.DataFetchFailed, 'CDS rejected')),
    );

    const result = await analyseSite({ coordinate: COORD, cdsApiKey: 'k' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.reconciliation).toBeUndefined();
      expect(result.value.metadata.reanalysisSucceeded).toBeUndefined();
      expect(result.value.metadata.sourcesFailed).toContain('ERA5');
      expect(result.value.metadata.sourcesFailed).toContain('CERRA');
      expect(result.value.factors.length).toBeGreaterThan(0);
    }
  });

  it('caller-supplied reanalysis override wins over CDS auto-fetch', async () => {
    setupHappyPathMocks();
    vi.mocked(isInCerraDomain).mockReturnValue(true);

    const result = await analyseSite({
      coordinate: COORD,
      cdsApiKey: 'k',
      reanalysis: {
        era5: { summary: makeSummary(8.0, 5), history: makeHistory(8.0, 36) },
      },
    });
    expect(result.ok).toBe(true);
    expect(fetchEra5MonthlyHistory).not.toHaveBeenCalled();
    expect(fetchCerraMonthlyHistory).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.value.metadata.reconciliation?.reference).toBe('era5');
    }
  });
});
