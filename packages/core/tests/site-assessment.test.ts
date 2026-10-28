import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assessSite } from '../src/site/site-assessment.js';
import { ScoringErrorCode } from '../src/types/errors.js';
import { boundary, turbine, windData } from './fixtures/layout-search.js';

const mocks = vi.hoisted(() => ({
  analyseSite: vi.fn(),
  generateSampleGrid: vi.fn(),
  fetchConstraintData: vi.fn(),
}));
vi.mock('../src/scoring/engine.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/scoring/engine.js')>()),
  analyseSite: mocks.analyseSite,
}));
vi.mock('../src/site/site-boundary.js', () => ({ generateSampleGrid: mocks.generateSampleGrid }));
vi.mock('../src/constraints/constraint-queries.js', () => ({
  fetchConstraintData: mocks.fetchConstraintData,
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.generateSampleGrid.mockReturnValue([boundary.centroid]);
  mocks.fetchConstraintData.mockResolvedValue({ ok: true, value: { elements: [] } });
  mocks.analyseSite.mockResolvedValue({
    ok: true,
    value: {
      coordinate: boundary.centroid,
      compositeScore: 70,
      factors: [],
      windResource: { resolved: windData },
      metadata: { sourcesUsed: ['NASA POWER'], sourcesFailed: [], windShearAlpha: 0.14 },
    },
  });
});

describe('assessSite', () => {
  it('honours a requested turbine model with layout and energy results', async () => {
    const result = await assessSite(boundary, { turbineModel: turbine, hubHeightM: 100 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.turbineLayout?.turbineCount).toBeGreaterThan(0);
    expect(result.value.energyYield?.turbineCount).toBe(result.value.turbineLayout?.turbineCount);
    expect(result.value.energyYield?.hubHeightM).toBe(100);
    expect(result.value.energyYield?.summary).toContain('highest-scoring sample point');
  });

  it('cannot invent wind evidence for requested energy calculations', async () => {
    mocks.analyseSite.mockResolvedValue({
      ok: true,
      value: {
        coordinate: boundary.centroid,
        compositeScore: null,
        factors: [],
        windResource: null,
        metadata: { sourcesUsed: [], sourcesFailed: ['NASA POWER'] },
      },
    });
    const result = await assessSite(boundary, { turbineModel: turbine });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ScoringErrorCode.InsufficientData);
  });
  it('propagates missing constraint evidence instead of reporting a viable site', async () => {
    const failure = {
      ok: false,
      error: { code: ScoringErrorCode.DataFetchFailed, message: 'Overpass unavailable' },
    };
    mocks.fetchConstraintData.mockResolvedValue(failure);
    expect(await assessSite(boundary)).toEqual(failure);
    expect(mocks.analyseSite).not.toHaveBeenCalled();
  });

  it('validates concurrency and spacing before generating or fetching anything', async () => {
    // An empty grid also keeps the old invalid-concurrency implementation from hanging.
    mocks.generateSampleGrid.mockReturnValue([]);
    for (const options of [
      { maxConcurrentAnalyses: 0 },
      { maxConcurrentAnalyses: -1 },
      { maxConcurrentAnalyses: 1.5 },
      { maxConcurrentAnalyses: Infinity },
      { gridSpacingKm: 0 },
      { gridSpacingKm: NaN },
      { hubHeightM: 0 },
    ]) {
      const result = await assessSite(boundary, options);
      expect(result.ok).toBe(false);
    }
    expect(mocks.generateSampleGrid).not.toHaveBeenCalled();
    expect(mocks.fetchConstraintData).not.toHaveBeenCalled();
  });

  it('keeps a successful assessment and its constraint provenance', async () => {
    const result = await assessSite(boundary);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.aggregatedScore.compositeScore).toBe(70);
    expect(result.value.metadata.sourcesUsed).toContain('Overpass (constraints)');
    expect(result.value.metadata.sourcesFailed).toEqual([]);
  });
});
