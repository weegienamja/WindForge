import { describe, it, expect } from 'vitest';
// Load the shared chart dependency graph during collection, outside per-test deadlines.
import { WindTrendChart } from '../src/components/WindTrendChart.js';

// NOTE: We cannot import from '../src/index.js' directly because SiteMap imports Leaflet,
// which requires `window` (DOM). Instead, test individual component modules.

// ─── Smoke: chart components are importable ───

describe('Chart component exports', () => {
  it('exports WindTrendChart', () => {
    expect(typeof WindTrendChart).toBe('function');
  });

  it('exports SeasonalHeatmap', async () => {
    const mod = await import('../src/components/SeasonalHeatmap.js');
    expect(typeof mod.SeasonalHeatmap).toBe('function');
  });

  it('exports MonthlyBoxPlot', async () => {
    const mod = await import('../src/components/MonthlyBoxPlot.js');
    expect(typeof mod.MonthlyBoxPlot).toBe('function');
  });

  it('exports DiurnalProfile', async () => {
    const mod = await import('../src/components/DiurnalProfile.js');
    expect(typeof mod.DiurnalProfile).toBe('function');
  });

  it('exports WindSpeedDistribution', async () => {
    const mod = await import('../src/components/WindSpeedDistribution.js');
    expect(typeof mod.WindSpeedDistribution).toBe('function');
  });

  it('exports ScoreCard', async () => {
    const mod = await import('../src/components/ScoreCard.js');
    expect(typeof mod.ScoreCard).toBe('function');
  });

  it('exports WeightSliders', async () => {
    const mod = await import('../src/components/WeightSliders.js');
    expect(typeof mod.WeightSliders).toBe('function');
  });

  it('exports ExportButton', async () => {
    const mod = await import('../src/components/ExportButton.js');
    expect(typeof mod.ExportButton).toBe('function');
  });

  it('exports ScenarioCompare', async () => {
    const mod = await import('../src/components/ScenarioCompare.js');
    expect(typeof mod.ScenarioCompare).toBe('function');
  });
});

// ─── WindRose helpers ───

describe('WindRose helpers', () => {
  it('degreesToCompass maps 0 to N', async () => {
    const { degreesToCompass } = await import('../src/components/WindRose.js');
    expect(degreesToCompass(0)).toBe('N');
  });

  it('degreesToCompass maps 90 to E', async () => {
    const { degreesToCompass } = await import('../src/components/WindRose.js');
    expect(degreesToCompass(90)).toBe('E');
  });

  it('degreesToCompass maps 180 to S', async () => {
    const { degreesToCompass } = await import('../src/components/WindRose.js');
    expect(degreesToCompass(180)).toBe('S');
  });

  it('degreesToCompass maps 270 to W', async () => {
    const { degreesToCompass } = await import('../src/components/WindRose.js');
    expect(degreesToCompass(270)).toBe('W');
  });

  it('degreesToCompass normalises negative degrees', async () => {
    const { degreesToCompass } = await import('../src/components/WindRose.js');
    expect(degreesToCompass(-90)).toBe('W');
  });

  it('degreesToCompass handles 360 as N', async () => {
    const { degreesToCompass } = await import('../src/components/WindRose.js');
    expect(degreesToCompass(360)).toBe('N');
  });

  it('emptyRoseData creates 16 directions', async () => {
    const { emptyRoseData, DEFAULT_WIND_BANDS } = await import('../src/components/WindRose.js');
    const data = emptyRoseData(DEFAULT_WIND_BANDS);
    expect(data).toHaveLength(16);
    expect(data[0]?.direction).toBe('N');
    expect(data[8]?.direction).toBe('S');
  });

  it('emptyRoseData initialises all band values to 0', async () => {
    const { emptyRoseData, DEFAULT_WIND_BANDS } = await import('../src/components/WindRose.js');
    const data = emptyRoseData(DEFAULT_WIND_BANDS);
    for (const row of data) {
      for (const band of DEFAULT_WIND_BANDS) {
        expect(row[band.label]).toBe(0);
      }
    }
  });

  it('COMPASS_DIRECTIONS contains 16 entries', async () => {
    const { COMPASS_DIRECTIONS } = await import('../src/components/WindRose.js');
    expect(COMPASS_DIRECTIONS).toHaveLength(16);
  });

  it('DEFAULT_WIND_BANDS covers 0 to Infinity', async () => {
    const { DEFAULT_WIND_BANDS } = await import('../src/components/WindRose.js');
    expect(DEFAULT_WIND_BANDS[0]?.minMs).toBe(0);
    expect(DEFAULT_WIND_BANDS[DEFAULT_WIND_BANDS.length - 1]?.maxMs).toBe(Infinity);
  });
});

// ─── Theme exports ───

describe('Theme system exports', () => {
  it('exports themeToCSS', async () => {
    const { themeToCSS } = await import('../src/styles/theme.js');
    expect(typeof themeToCSS).toBe('function');
  });

  it('themeToCSS returns CSS custom properties object', async () => {
    const { themeToCSS } = await import('../src/styles/theme.js');
    const vars = themeToCSS({ primary: '#ff0000' });
    expect(vars).toHaveProperty('--wsi-primary', '#ff0000');
  });

  it('themeToCSS handles empty theme', async () => {
    const { themeToCSS } = await import('../src/styles/theme.js');
    const vars = themeToCSS({});
    expect(typeof vars).toBe('object');
  });
});

// ─── useMapInteraction hook export ───

describe('Hook exports', () => {
  it('exports useMapInteraction', async () => {
    const { useMapInteraction } = await import('../src/hooks/use-map-interaction.js');
    expect(typeof useMapInteraction).toBe('function');
  });

  it('exports useSiteScore', async () => {
    const { useSiteScore } = await import('../src/hooks/use-site-score.js');
    expect(typeof useSiteScore).toBe('function');
  });
});
