import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type {
  MonthlyWindHistory,
  ReconciliationDiagnostics,
  SiteAnalysis,
  ScoringError,
} from '@jamieblair/windforge-core';
import { ScoringErrorCode } from '@jamieblair/windforge-core';
import { expectNoAxeViolations } from './axe-helper';
import {
  glasgowReconciled,
  englandNoReconciliation,
  constrainedSite,
} from './fixtures/analyse-fixtures';

// ─── Mocks ─────────────────────────────────────────────────────────────

// Mock the heavy MapPanel so leaflet/react-leaflet doesn't have to load.
vi.mock('../src/components/analyse/MapPanel', () => ({
  MapPanel: ({ loading }: { loading: boolean }) => (
    <div data-testid="map-panel" data-loading={loading ? 'true' : 'false'}>
      <fieldset data-testid="layer-toggles">
        <legend>Layers</legend>
        <label>
          <input type="checkbox" data-layer="wind" defaultChecked />
          Wind resource
        </label>
        <label>
          <input type="checkbox" data-layer="constraints" defaultChecked />
          Constraints
        </label>
      </fieldset>
    </div>
  ),
}));

// Mock the chart module: stubs that surface prop state via data attributes
// so the page-level tests stay fast and don't depend on Recharts in jsdom.
interface ChartStubProps {
  raw: MonthlyWindHistory;
  corrected: MonthlyWindHistory | null;
  reference?: 'cerra' | 'era5' | null;
  diagnostics?: ReconciliationDiagnostics | null;
}
vi.mock('../src/components/charts/MonthlyHistoryChart', () => ({
  MonthlyHistoryChart: ({ corrected, reference, diagnostics }: ChartStubProps) => (
    <div
      data-testid="monthly-history-chart"
      data-has-corrected={corrected ? 'true' : 'false'}
      data-reference={reference ?? 'none'}
    >
      <span>NASA POWER (raw)</span>
      {corrected ? <span>Corrected ({(reference ?? 'cerra').toUpperCase()})</span> : null}
      {diagnostics ? (
        <div data-testid="monthly-history-stats">
          Bias {diagnostics.biasBeforeMs.toFixed(2)} → {diagnostics.biasAfterMs.toFixed(2)} m/s · RMSE{' '}
          {diagnostics.rmseBeforeMs.toFixed(2)} → {diagnostics.rmseAfterMs.toFixed(2)}
        </div>
      ) : null}
    </div>
  ),
  MonthlyHistoryEmpty: () => <div data-testid="monthly-history-empty" />,
  MonthlyHistorySkeleton: () => <div data-testid="monthly-history-skeleton" />,
}));

// Configurable site-score hook state, controlled per test.
type HookState = {
  analysis: SiteAnalysis | null;
  loading: boolean;
  error: ScoringError | null;
  analyse: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
};

const hookState: HookState = {
  analysis: null,
  loading: false,
  error: null,
  analyse: vi.fn(),
  reset: vi.fn(),
};

vi.mock('@jamieblair/windforge', () => ({
  useSiteScore: () => hookState,
}));

// Mutable wind-history hook state.
type HistoryState = {
  status: 'idle' | 'running' | 'success' | 'error';
  data: { raw: MonthlyWindHistory; corrected: MonthlyWindHistory | null } | null;
  reconciliation: {
    method: string;
    reference: 'cerra' | 'era5' | null;
    diagnostics: ReconciliationDiagnostics | null;
  } | null;
  error: ScoringError | null;
  run: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
};
const historyState: HistoryState = {
  status: 'idle',
  data: null,
  reconciliation: null,
  error: null,
  run: vi.fn(),
  reset: vi.fn(),
};
vi.mock('../src/hooks/useWindHistory', () => ({
  useWindHistory: () => historyState,
}));

// Mutable AEP hook state.
type AepHookState = {
  status: 'idle' | 'running' | 'success' | 'error';
  data: unknown | null;
  error: ScoringError | null;
  run: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
};
const aepState: AepHookState = {
  status: 'idle',
  data: null,
  error: null,
  run: vi.fn(),
  reset: vi.fn(),
};
vi.mock('../src/hooks/useAep', () => ({
  useAep: () => aepState,
}));

// Stub the WindRose and PowerCurve charts so leaflet/recharts heavy-lifting
// stays out of these page-level tests.
vi.mock('../src/components/charts/WindRoseChart', () => ({
  WindRoseChart: ({ history }: { history: { records: unknown[] } }) => (
    <div data-testid="wind-rose-chart" data-records={history.records.length} />
  ),
  WindRoseEmpty: () => <div data-testid="wind-rose-empty" />,
  WindRoseSkeleton: () => <div data-testid="wind-rose-skeleton" />,
}));

vi.mock('../src/components/charts/PowerCurveChart', () => ({
  PowerCurveChart: ({
    turbine,
    aep,
  }: {
    turbine: { id: string };
    aep: { p50: { aepMwh: number }; p75: { aepMwh: number }; p90: { aepMwh: number } };
  }) => (
    <div
      data-testid="power-curve-chart"
      data-turbine={turbine.id}
      data-p50={aep.p50.aepMwh}
      data-p75={aep.p75.aepMwh}
      data-p90={aep.p90.aepMwh}
    />
  ),
  PowerCurveEmpty: () => <div data-testid="power-curve-empty" />,
  PowerCurveSkeleton: () => <div data-testid="power-curve-skeleton" />,
}));

// Stable router/searchParams mocks.
const mockReplace = vi.fn();
let mockParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => mockParams,
}));

// ─── Helpers ───────────────────────────────────────────────────────────

async function renderPage() {
  const mod = await import('../src/app/analyse/AnalyseClient');
  const { AnalyseClient: AnalysePage } = mod;
  return render(<AnalysePage />);
}

function resetHook() {
  hookState.analysis = null;
  hookState.loading = false;
  hookState.error = null;
  hookState.analyse = vi.fn().mockResolvedValue(undefined);
  hookState.reset = vi.fn();
}

function resetHistory() {
  historyState.status = 'idle';
  historyState.data = null;
  historyState.reconciliation = null;
  historyState.error = null;
  historyState.run = vi.fn();
  historyState.reset = vi.fn();
}

function resetAep() {
  aepState.status = 'idle';
  aepState.data = null;
  aepState.error = null;
  aepState.run = vi.fn();
  aepState.reset = vi.fn();
}

const SAMPLE_AEP = {
  turbineModel: { id: 'gw-2mw', manufacturer: 'Generic', model: '2MW', ratedPowerKw: 2000, rotorDiameterM: 90 },
  hubHeightM: 100,
  turbineCount: 1,
  grossAepMwh: 7800,
  grossTotalAepMwh: 7800,
  grossCapacityFactor: 0.44,
  losses: { wakeLossPct: 8, electricalLossPct: 2, availabilityLossPct: 3, environmentalLossPct: 1, icingLossPct: 0.5, hysteresisLossPct: 0.5, gridCurtailmentPct: 1, totalLossPct: 16, items: [] },
  netAepMwh: 6552,
  netTotalAepMwh: 6552,
  netCapacityFactor: 0.37,
  p50: { label: 'P50', aepMwh: 6552, totalAepMwh: 6552, capacityFactor: 0.37, description: '' },
  p75: { label: 'P75', aepMwh: 6010, totalAepMwh: 6010, capacityFactor: 0.34, description: '' },
  p90: { label: 'P90', aepMwh: 5500, totalAepMwh: 5500, capacityFactor: 0.31, description: '' },
  monthlyProductionMwh: [],
  assumptions: { windDataYears: 10, referenceHeightM: 50, extrapolationMethod: 'power-law', airDensityKgM3: 1.225, weibullK: 2.1, weibullC: 7.8, lossAssumptions: '', uncertaintyMethod: '' },
  confidence: 'high' as const,
  summary: '',
};

const SAMPLE_HISTORY: MonthlyWindHistory = {
  coordinate: { lat: 55.86, lng: -4.25 },
  records: [
    { year: 2023, month: 1, ws2m: 4, ws10m: 6, ws50m: 8.2, wd10m: 270, wd50m: 270 },
    { year: 2023, month: 2, ws2m: 4.1, ws10m: 6.1, ws50m: 8.3, wd10m: 280, wd50m: 280 },
  ],
  startYear: 2023,
  endYear: 2023,
};

const SAMPLE_DIAGNOSTICS: ReconciliationDiagnostics = {
  overlapMonths: 132,
  biasBeforeMs: -0.42,
  biasAfterMs: 0.03,
  rmseBeforeMs: 0.91,
  rmseAfterMs: 0.34,
  rSquared: 0.86,
  ksStatistic: 0.07,
};

beforeEach(() => {
  resetHook();
  resetHistory();
  resetAep();
  mockReplace.mockReset();
  mockParams = new URLSearchParams();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }));
});

// ─── Tests ─────────────────────────────────────────────────────────────

describe('Analyse page', () => {
  it('renders the empty state with no params', async () => {
    await renderPage();
    expect(screen.getByText('NO ANALYSIS')).toBeInTheDocument();
    expect(screen.getByText(/Enter a coordinate to begin/)).toBeInTheDocument();
  });

  it('renders the running state when analysis is in flight', async () => {
    hookState.loading = true;
    await renderPage();
    const map = screen.getByTestId('map-panel');
    expect(map).toHaveAttribute('data-loading', 'true');
    expect(screen.getByRole('button', { name: /Running/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('renders a successful analysis with composite score and factor bars', async () => {
    hookState.analysis = glasgowReconciled;
    await renderPage();
    expect(screen.getByTestId('composite-score')).toHaveTextContent('72');
    expect(screen.getAllByText('Wind resource').length).toBeGreaterThan(0);
    expect(screen.getByText('Terrain')).toBeInTheDocument();
    expect(screen.getByText('Grid proximity')).toBeInTheDocument();
    // Six progress bars, one per factor.
    const bars = screen
      .getAllByRole('progressbar')
      .filter((b) => b.getAttribute('aria-label')?.endsWith('score'));
    expect(bars).toHaveLength(6);
  });

  it('renders the failure state with retry button', async () => {
    hookState.error = {
      code: ScoringErrorCode.DataFetchFailed,
      message: 'NASA POWER did not respond.',
    };
    await renderPage();
    expect(screen.getByText('ERROR')).toBeInTheDocument();
    expect(screen.getByText(/Could not reach NASA POWER/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('shows the bias-correction badge only when reconciliation is present', async () => {
    hookState.analysis = glasgowReconciled;
    const { unmount } = await renderPage();
    expect(screen.getByTestId('bias-correction-badge')).toBeInTheDocument();
    expect(screen.getAllByText(/CERRA/).length).toBeGreaterThan(0);
    expect(screen.getByText(/132 months overlap/)).toBeInTheDocument();
    unmount();
    resetHook();
    hookState.analysis = englandNoReconciliation;
    await renderPage();
    expect(screen.queryByTestId('bias-correction-badge')).not.toBeInTheDocument();
  });

  it('shows the hard-constraint banner only when hard constraints exist', async () => {
    hookState.analysis = glasgowReconciled;
    const { unmount } = await renderPage();
    expect(screen.queryByTestId('hard-constraint-banner')).not.toBeInTheDocument();
    unmount();
    resetHook();
    hookState.analysis = constrainedSite;
    await renderPage();
    const banner = screen.getByTestId('hard-constraint-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/2 hard constraints/i);
  });

  it('uses the warm accent for sub-20 factor scores', async () => {
    hookState.analysis = constrainedSite;
    await renderPage();
    const landUseLi = document.querySelector('[data-factor="landUseCompatibility"]');
    expect(landUseLi).not.toBeNull();
    // The fill div is the second child div inside the progressbar wrapper.
    const fill = landUseLi?.querySelector('[role="progressbar"] > div') as HTMLElement;
    expect(fill).toBeTruthy();
    expect(fill.style.background).toContain('--accent-warm');
  });

  it('triggers automatic analysis when URL params are present on mount', async () => {
    mockParams = new URLSearchParams('lat=55.86&lng=-4.25&hub=120');
    await renderPage();
    expect(hookState.analyse).toHaveBeenCalledTimes(1);
    expect(hookState.analyse).toHaveBeenCalledWith({
      coordinate: { lat: 55.86, lng: -4.25 },
      hubHeightM: 120,
    });
  });

  it('cancel button resets the in-flight analysis', async () => {
    hookState.loading = true;
    await renderPage();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    await act(async () => {
      fireEvent.click(cancel);
    });
    expect(hookState.reset).toHaveBeenCalledTimes(1);
  });

  it('layer toggle checkboxes update state', async () => {
    await renderPage();
    const wind = document.querySelector('[data-layer="wind"]') as HTMLInputElement;
    expect(wind).not.toBeNull();
    expect(wind.checked).toBe(true);
    await act(async () => {
      fireEvent.click(wind);
    });
    expect(wind.checked).toBe(false);
  });

  it('has no axe violations in the empty state', async () => {
    const { container } = await renderPage();
    await expectNoAxeViolations(container);
  });

  it('has no axe violations in the success state', async () => {
    hookState.analysis = glasgowReconciled;
    const { container } = await renderPage();
    await expectNoAxeViolations(container);
  });

  it('has no axe violations in the error state', async () => {
    hookState.error = {
      code: ScoringErrorCode.DataFetchFailed,
      message: 'Upstream API unavailable.',
    };
    const { container } = await renderPage();
    await expectNoAxeViolations(container);
  });

  it('renders the monthly history chart with both series when reconciliation is present', async () => {
    hookState.analysis = glasgowReconciled;
    historyState.status = 'success';
    historyState.data = { raw: SAMPLE_HISTORY, corrected: SAMPLE_HISTORY };
    historyState.reconciliation = {
      method: 'quantile',
      reference: 'cerra',
      diagnostics: SAMPLE_DIAGNOSTICS,
    };
    await renderPage();
    const chart = screen.getByTestId('monthly-history-chart');
    expect(chart).toHaveAttribute('data-has-corrected', 'true');
    expect(chart).toHaveAttribute('data-reference', 'cerra');
    expect(chart).toHaveTextContent('NASA POWER (raw)');
    expect(chart).toHaveTextContent('Corrected (CERRA)');
  });

  it('renders the monthly history chart with only the raw series when reconciliation is absent', async () => {
    hookState.analysis = englandNoReconciliation;
    historyState.status = 'success';
    historyState.data = { raw: SAMPLE_HISTORY, corrected: null };
    historyState.reconciliation = null;
    await renderPage();
    const chart = screen.getByTestId('monthly-history-chart');
    expect(chart).toHaveAttribute('data-has-corrected', 'false');
    expect(chart).toHaveTextContent('NASA POWER (raw)');
    expect(chart).not.toHaveTextContent(/Corrected \(/);
  });

  it('shows the correction stats annotation when reconciliation is present', async () => {
    hookState.analysis = glasgowReconciled;
    historyState.status = 'success';
    historyState.data = { raw: SAMPLE_HISTORY, corrected: SAMPLE_HISTORY };
    historyState.reconciliation = {
      method: 'quantile',
      reference: 'cerra',
      diagnostics: SAMPLE_DIAGNOSTICS,
    };
    await renderPage();
    const stats = screen.getByTestId('monthly-history-stats');
    expect(stats).toHaveTextContent(/Bias.*-0\.42.*0\.03 m\/s/);
    expect(stats).toHaveTextContent(/RMSE 0\.91.*0\.34/);
  });

  it('shows a skeleton while the wind history is loading', async () => {
    hookState.analysis = glasgowReconciled;
    historyState.status = 'running';
    historyState.data = null;
    await renderPage();
    expect(screen.getByTestId('monthly-history-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('monthly-history-chart')).not.toBeInTheDocument();
  });

  it('renders the full responsive layout below 768px (no degraded text-only fallback)', async () => {
    // Override matchMedia for this test only: report a narrow (mobile) viewport.
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = (query: string) =>
      ({
        matches: query.includes('max-width: 767px'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList;
    try {
      hookState.analysis = glasgowReconciled;
      await renderPage();
      // Mobile now gets the real analysis UI — top bar, map and results — not a
      // "use a desktop" fallback.
      expect(screen.getByTestId('analyse-topbar')).toBeInTheDocument();
      expect(screen.getByTestId('map-panel')).toBeInTheDocument();
      expect(screen.getByTestId('composite-score')).toHaveTextContent('72');
      expect(screen.queryByTestId('mobile-fallback')).not.toBeInTheDocument();
      expect(screen.queryByText(/text-only analysis/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/open this page on a desktop/i)).not.toBeInTheDocument();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('uses the bias-corrected eyebrow when reconciliation is present', async () => {
    hookState.analysis = glasgowReconciled;
    historyState.status = 'success';
    historyState.data = { raw: SAMPLE_HISTORY, corrected: SAMPLE_HISTORY };
    historyState.reconciliation = {
      method: 'quantile',
      reference: 'cerra',
      diagnostics: SAMPLE_DIAGNOSTICS,
    };
    await renderPage();
    expect(screen.getByText(/bias-corrected history/i)).toBeInTheDocument();
  });

  it('renders the wind rose drilldown when history data is present', async () => {
    hookState.analysis = englandNoReconciliation;
    historyState.status = 'success';
    historyState.data = { raw: SAMPLE_HISTORY, corrected: null };
    historyState.reconciliation = null;
    await renderPage();
    const rose = screen.getByTestId('wind-rose-chart');
    expect(rose).toBeInTheDocument();
    expect(rose).toHaveAttribute('data-records', String(SAMPLE_HISTORY.records.length));
  });

  it('shows a wind rose skeleton while history is loading', async () => {
    hookState.analysis = glasgowReconciled;
    historyState.status = 'running';
    historyState.data = null;
    await renderPage();
    expect(screen.getByTestId('wind-rose-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('wind-rose-chart')).not.toBeInTheDocument();
  });

  it('renders the power curve drilldown when AEP succeeds', async () => {
    hookState.analysis = glasgowReconciled;
    aepState.status = 'success';
    aepState.data = SAMPLE_AEP;
    await renderPage();
    const curve = screen.getByTestId('power-curve-chart');
    expect(curve).toBeInTheDocument();
    expect(curve).toHaveAttribute('data-p50', String(SAMPLE_AEP.p50.aepMwh));
    expect(curve).toHaveAttribute('data-p75', String(SAMPLE_AEP.p75.aepMwh));
    expect(curve).toHaveAttribute('data-p90', String(SAMPLE_AEP.p90.aepMwh));
  });

  it('shows a power curve skeleton while AEP is loading', async () => {
    hookState.analysis = glasgowReconciled;
    aepState.status = 'running';
    aepState.data = null;
    await renderPage();
    expect(screen.getByTestId('power-curve-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('power-curve-chart')).not.toBeInTheDocument();
  });

  it('shows the power curve empty state when AEP errors out', async () => {
    hookState.analysis = glasgowReconciled;
    aepState.status = 'error';
    aepState.data = null;
    aepState.error = { code: ScoringErrorCode.DataFetchFailed, message: 'AEP failed.' };
    await renderPage();
    expect(screen.getByTestId('power-curve-empty')).toBeInTheDocument();
  });

  it('shows the MCP cross-link below the diagnostics card on success', async () => {
    hookState.analysis = glasgowReconciled;
    await renderPage();
    expect(screen.getByTestId('mcp-cross-link')).toBeInTheDocument();
  });

  it('renders human error copy without leaking the raw enum code', async () => {
    hookState.error = {
      code: ScoringErrorCode.DataFetchFailed,
      message: 'NASA POWER returned 503',
    };
    await renderPage();
    expect(screen.getByText(/Could not reach NASA POWER/i)).toBeInTheDocument();
    expect(screen.queryByText(/DATA_FETCH_FAILED/)).not.toBeInTheDocument();
  });

  it('shows the singular hard-constraint banner copy when one constraint exists', async () => {
    hookState.analysis = constrainedSite;
    await renderPage();
    expect(screen.getByTestId('hard-constraint-banner')).toBeInTheDocument();
    // The constrainedSite fixture is expected to have at least one hard constraint.
    const text = screen.getByTestId('hard-constraint-banner').textContent ?? '';
    expect(text).toMatch(/hard constraint/);
    expect(text).toMatch(/unlikely to be developable/i);
  });

  it('renders the footer on the analyse page with key links', async () => {
    hookState.analysis = glasgowReconciled;
    await renderPage();
    const footer = screen.getByTestId('site-footer');
    expect(footer).toBeInTheDocument();
    expect(footer).toHaveTextContent(/GitHub/);
    expect(footer).toHaveTextContent(/NASA POWER/);
    expect(footer).toHaveTextContent(/ERA5/);
  });
});
