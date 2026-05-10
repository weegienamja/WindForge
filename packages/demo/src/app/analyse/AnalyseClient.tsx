'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type {
  AnalysisMetadata,
  FactorScore,
  ReconciliationMetadata,
  SiteAnalysis,
  TurbineModel,
} from '@jamieblair/windforge-core';
import { getAllTurbines, ScoringFactor } from '@jamieblair/windforge-core';
import { DataCard } from '../../components/primitives/DataCard';
import { NumericReadout } from '../../components/primitives/NumericReadout';
import { ConfidenceBadge } from '../../components/primitives/ConfidenceBadge';
import { SectionHeading } from '../../components/primitives/SectionHeading';
import { MapPanel } from '../../components/analyse/MapPanel';
import { ScoreFactorBars } from '../../components/analyse/ScoreFactorBars';
import { BiasCorrectionBadge } from '../../components/analyse/BiasCorrectionBadge';
import {
  MonthlyHistoryChart,
  MonthlyHistoryEmpty,
  MonthlyHistorySkeleton,
} from '../../components/charts/MonthlyHistoryChart';
import {
  WindRoseChart,
  WindRoseEmpty,
  WindRoseSkeleton,
} from '../../components/charts/WindRoseChart';
import {
  PowerCurveChart,
  PowerCurveEmpty,
  PowerCurveSkeleton,
} from '../../components/charts/PowerCurveChart';
import { Footer } from '../../components/Footer';
import { useAnalyse } from '../../hooks/useAnalyse';
import { useWindHistory } from '../../hooks/useWindHistory';
import { useAep } from '../../hooks/useAep';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { errorCopyFor } from '../../lib/errorCopy';

const HUB_OPTIONS = [80, 100, 120, 140] as const;
type Hub = (typeof HUB_OPTIONS)[number];

function pickDefaultTurbine(turbines: TurbineModel[]): TurbineModel | undefined {
  return (
    turbines.find((t) => Math.abs(t.ratedPowerKw - 2000) < 250) ?? turbines[0]
  );
}

function clampLat(v: number): boolean {
  return Number.isFinite(v) && v >= -90 && v <= 90;
}

function clampLng(v: number): boolean {
  return Number.isFinite(v) && v >= -180 && v <= 180;
}

export function AnalyseClient() {
  return (
    <Suspense fallback={null}>
      <AnalysePageInner />
    </Suspense>
  );
}

function AnalysePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const turbines = useMemo(() => getAllTurbines(), []);
  const defaultTurbine = useMemo(() => pickDefaultTurbine(turbines), [turbines]);

  const [lat, setLat] = useState<string>(() => searchParams?.get('lat') ?? '');
  const [lng, setLng] = useState<string>(() => searchParams?.get('lng') ?? '');
  const [hub, setHub] = useState<Hub>(() => {
    const raw = Number(searchParams?.get('hub'));
    return (HUB_OPTIONS as readonly number[]).includes(raw) ? (raw as Hub) : 100;
  });
  const [turbineId, setTurbineId] = useState<string>(defaultTurbine?.id ?? '');

  const { status, data, error, run, cancel } = useAnalyse();
  const history = useWindHistory();
  const aep = useAep();
  const isMobile = useMediaQuery('(max-width: 767px)');

  const selectedTurbine = useMemo(
    () => turbines.find((t) => t.id === turbineId) ?? defaultTurbine,
    [turbines, turbineId, defaultTurbine],
  );

  const latNum = Number(lat);
  const lngNum = Number(lng);
  const valid =
    lat.trim() !== '' && lng.trim() !== '' && clampLat(latNum) && clampLng(lngNum);

  const submit = useCallback(async () => {
    if (!valid) return;
    const params = new URLSearchParams();
    params.set('lat', String(latNum));
    params.set('lng', String(lngNum));
    params.set('hub', String(hub));
    router.replace(`/analyse?${params.toString()}`);
    // Kick off the wind-history fetch in parallel so the chart starts
    // loading the moment the user clicks Run.
    history.run({ lat: latNum, lng: lngNum });
    if (selectedTurbine) {
      aep.run({
        coordinate: { lat: latNum, lng: lngNum },
        turbine: selectedTurbine,
        hubHeightM: hub,
      });
    }
    await run({
      coordinate: { lat: latNum, lng: lngNum },
      hubHeightM: hub,
    });
  }, [valid, latNum, lngNum, hub, router, run, history, aep, selectedTurbine]);

  // URL-driven auto-run on mount.
  useEffect(() => {
    const qLat = searchParams?.get('lat');
    const qLng = searchParams?.get('lng');
    const qHub = Number(searchParams?.get('hub'));
    if (!qLat || !qLng) return;
    const la = Number(qLat);
    const ln = Number(qLng);
    if (!clampLat(la) || !clampLng(ln)) return;
    const hh: Hub = (HUB_OPTIONS as readonly number[]).includes(qHub)
      ? (qHub as Hub)
      : 100;
    void run({ coordinate: { lat: la, lng: ln }, hubHeightM: hh });
    history.run({ lat: la, lng: ln });
    if (selectedTurbine) {
      aep.run({ coordinate: { lat: la, lng: ln }, turbine: selectedTurbine, hubHeightM: hh });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const coordinate =
    data?.coordinate ?? (valid ? { lat: latNum, lng: lngNum } : null);

  if (isMobile) {
    return (
      <MobileFallback
        valid={valid}
        latNum={latNum}
        lngNum={lngNum}
        lat={lat}
        lng={lng}
        setLat={setLat}
        setLng={setLng}
        status={status}
        data={data}
        error={error}
        onRun={submit}
      />
    );
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--surface-0)',
        color: 'var(--text-primary)',
      }}
    >
      <header
        data-testid="analyse-topbar"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: 'var(--surface-1)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: 'var(--space-3) var(--space-5)',
        }}
      >
        <div
          style={{
            maxWidth: 1400,
            margin: '0 auto',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            gap: 'var(--space-4)',
          }}
        >
          <Link
            href="/"
            className="t-mono-data"
            style={{
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              fontSize: 12,
              padding: '8px 0',
            }}
          >
            ← WindForge
          </Link>
          <Field label="Latitude">
            <input
              type="number"
              step="any"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              aria-invalid={!valid && lat !== ''}
              aria-label="Latitude"
              style={inputStyle}
            />
          </Field>
          <Field label="Longitude">
            <input
              type="number"
              step="any"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              aria-invalid={!valid && lng !== ''}
              aria-label="Longitude"
              style={inputStyle}
            />
          </Field>
          <Field label="Hub height">
            <select
              value={hub}
              onChange={(e) => setHub(Number(e.target.value) as Hub)}
              aria-label="Hub height"
              style={inputStyle}
            >
              {HUB_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {h} m
                </option>
              ))}
            </select>
          </Field>
          <Field label="Turbine">
            <select
              value={turbineId}
              onChange={(e) => setTurbineId(e.target.value)}
              aria-label="Turbine model"
              style={inputStyle}
            >
              {turbines.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.manufacturer} {t.model} ({(t.ratedPowerKw / 1000).toFixed(1)} MW)
                </option>
              ))}
            </select>
          </Field>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={submit}
              disabled={!valid || status === 'running'}
              style={{
                ...buttonStyle,
                background: valid ? 'var(--accent-cool)' : 'var(--surface-elevated)',
                color: valid ? '#0a0e1a' : 'var(--text-tertiary)',
                cursor: valid && status !== 'running' ? 'pointer' : 'not-allowed',
              }}
            >
              {status === 'running' ? 'Running…' : 'Run'}
            </button>
            {status === 'running' ? (
              <button
                type="button"
                onClick={cancel}
                style={{
                  ...buttonStyle,
                  background: 'transparent',
                  border: '1px solid var(--border-strong)',
                  color: 'var(--text-primary)',
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <section
        style={{
          maxWidth: 1400,
          margin: '0 auto',
          padding: 'var(--space-5)',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 60%) minmax(0, 40%)',
          gap: 'var(--space-5)',
        }}
      >
        <div style={{ minHeight: 480 }}>
          <MapPanel coordinate={coordinate} loading={status === 'running'} />
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          {status === 'idle' && !data && !error ? <EmptyState /> : null}
          {status === 'error' && error ? (
            <ErrorPanel kind={error.code} message={error.message} onRetry={submit} />
          ) : null}
          {data ? <ResultPanels analysis={data} /> : null}
          {data ? <McpCrossLink /> : null}
        </div>
      </section>

      {data ? (
        <Drilldown
          history={history}
          aep={aep}
          turbine={selectedTurbine}
          hubHeightM={hub}
          reconciliation={data.metadata.reconciliation ?? null}
        />
      ) : null}
      <Footer />
    </main>
  );
}

function ResultPanels({ analysis }: { analysis: SiteAnalysis }) {
  const wind = analysis.factors.find((f) => f.factor === ScoringFactor.WindResource);
  const grid = analysis.factors.find((f) => f.factor === ScoringFactor.GridProximity);
  const access = analysis.factors.find(
    (f) => f.factor === ScoringFactor.AccessLogistics,
  );
  const reconciliation = analysis.metadata.reconciliation;

  return (
    <>
      <CompositeCard
        score={analysis.compositeScore}
        factors={analysis.factors}
        confidence={inferOverallConfidence(analysis.factors)}
      />
      <WindCard factor={wind} reconciliation={reconciliation} />
      <ConstraintsCard
        hardConstraints={analysis.hardConstraints}
        warnings={analysis.warnings}
      />
      <GridCard gridFactor={grid} accessFactor={access} />
      <DiagnosticsCard metadata={analysis.metadata} />
    </>
  );
}

function inferOverallConfidence(
  factors: ReadonlyArray<FactorScore>,
): 'high' | 'medium' | 'low' {
  const weights = { high: 3, medium: 2, low: 1 } as const;
  const avg =
    factors.reduce((acc, f) => acc + weights[f.confidence], 0) / factors.length;
  if (avg >= 2.5) return 'high';
  if (avg >= 1.5) return 'medium';
  return 'low';
}

function CompositeCard({
  score,
  factors,
  confidence,
}: {
  score: number;
  factors: ReadonlyArray<FactorScore>;
  confidence: 'high' | 'medium' | 'low';
}) {
  return (
    <DataCard eyebrow="OVERALL">
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-5)',
        }}
      >
        <span className="t-mono-large" data-testid="composite-score">
          {score.toFixed(0)}
        </span>
        <span className="t-caption" style={{ color: 'var(--text-secondary)' }}>
          / 100
        </span>
        <ConfidenceBadge confidence={confidence} />
      </div>
      <ScoreFactorBars factors={factors} />
    </DataCard>
  );
}

function WindCard({
  factor,
  reconciliation,
}: {
  factor?: FactorScore;
  reconciliation?: ReconciliationMetadata;
}) {
  const detail = factor?.detail ?? 'No wind data available.';
  const speedMatch = detail.match(/([0-9]+(?:\.[0-9]+)?)\s*m\/s/);
  const speed = speedMatch?.[1] ? Number(speedMatch[1]) : null;
  return (
    <DataCard eyebrow="WIND">
      {speed !== null ? (
        <NumericReadout
          value={speed}
          unit="m/s"
          confidence={factor?.confidence ?? 'low'}
          size="large"
        />
      ) : (
        <span className="t-mono-data" style={{ color: 'var(--text-tertiary)' }}>
          −
        </span>
      )}
      <p
        className="t-body"
        style={{
          color: 'var(--text-secondary)',
          marginTop: 'var(--space-3)',
          marginBottom: 0,
          fontSize: 13,
        }}
      >
        {detail}
      </p>
      {reconciliation ? <BiasCorrectionBadge reconciliation={reconciliation} /> : null}
    </DataCard>
  );
}

function ConstraintsCard({
  hardConstraints,
  warnings,
}: {
  hardConstraints: ReadonlyArray<{ description: string; severity: string }>;
  warnings: ReadonlyArray<{ description: string }>;
}) {
  const hardCount = hardConstraints.length;
  return (
    <DataCard eyebrow="CONSTRAINTS">
      {hardCount > 0 ? (
        <div
          data-testid="hard-constraint-banner"
          role="alert"
          style={{
            background: 'var(--accent-warm)',
            color: '#0a0e1a',
            padding: '8px 12px',
            borderRadius: 4,
            marginBottom: 'var(--space-3)',
          }}
        >
          <div
            className="t-eyebrow"
            style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em' }}
          >
            {hardCount} hard constraint{hardCount === 1 ? '' : 's'} detected.
          </div>
          <div
            className="t-body"
            style={{ marginTop: 4, fontSize: 12, color: '#0a0e1a' }}
          >
            This site is unlikely to be developable without resolving{' '}
            {hardCount === 1 ? 'this' : 'these'}.
          </div>
        </div>
      ) : null}
      {hardConstraints.length > 0 ? (
        <ul style={listStyle}>
          {hardConstraints.map((c, i) => (
            <li key={i} className="t-body" style={{ fontSize: 13 }}>
              <span
                className="t-eyebrow"
                style={{ color: 'var(--accent-warm)', marginRight: 8 }}
              >
                {c.severity}
              </span>
              {c.description}
            </li>
          ))}
        </ul>
      ) : null}
      {warnings.length > 0 ? (
        <ul style={{ ...listStyle, marginTop: 'var(--space-3)' }}>
          {warnings.map((w, i) => (
            <li
              key={i}
              className="t-body"
              style={{ fontSize: 13, color: 'var(--text-secondary)' }}
            >
              {w.description}
            </li>
          ))}
        </ul>
      ) : null}
      {hardCount === 0 && warnings.length === 0 ? (
        <p
          className="t-body"
          style={{ color: 'var(--text-secondary)', margin: 0, fontSize: 13 }}
        >
          No hard constraints or warnings detected within the search radius.
        </p>
      ) : null}
    </DataCard>
  );
}

function GridCard({
  gridFactor,
  accessFactor,
}: {
  gridFactor?: FactorScore;
  accessFactor?: FactorScore;
}) {
  return (
    <DataCard eyebrow="GRID">
      <p
        className="t-body"
        style={{ color: 'var(--text-secondary)', margin: 0, fontSize: 13 }}
      >
        {gridFactor?.detail ?? 'No grid data available.'}
      </p>
      {accessFactor ? (
        <p
          className="t-body"
          style={{
            color: 'var(--text-secondary)',
            margin: 'var(--space-3) 0 0',
            fontSize: 13,
          }}
        >
          {accessFactor.detail}
        </p>
      ) : null}
    </DataCard>
  );
}

function DiagnosticsCard({ metadata }: { metadata: AnalysisMetadata }) {
  const [open, setOpen] = useState(false);
  return (
    <DataCard eyebrow="DIAGNOSTICS">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="t-mono-data"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--accent-cool)',
          cursor: 'pointer',
          padding: 0,
          fontSize: 12,
        }}
      >
        {open ? 'Hide details' : 'Show details'}
      </button>
      {open ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            marginTop: 'var(--space-3)',
          }}
        >
          <DiagRow
            label="Sources used"
            value={metadata.sourcesUsed.join(', ') || 'none'}
          />
          <DiagRow
            label="Sources failed"
            value={metadata.sourcesFailed.join(', ') || 'none'}
          />
          <DiagRow label="Duration" value={`${metadata.durationMs} ms`} />
          <DiagRow label="Hub height" value={`${metadata.hubHeightM} m`} />
          <DiagRow label="Wind shear α" value={metadata.windShearAlpha.toFixed(2)} />
        </div>
      ) : null}
    </DataCard>
  );
}

function DiagRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span className="t-eyebrow" style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </span>
      <span className="t-mono-data" style={{ fontSize: 12 }}>
        {value}
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <DataCard eyebrow="NO ANALYSIS" title="Enter a coordinate to begin">
      <p
        className="t-body"
        style={{ color: 'var(--text-secondary)', margin: 0, fontSize: 13 }}
      >
        Enter a coordinate to run a six-factor wind site suitability analysis.
        NASA POWER for wind resource. ERA5 and CERRA reanalysis for bias
        correction. Open-Elevation for terrain. OpenStreetMap for grid
        infrastructure and constraints.
      </p>
    </DataCard>
  );
}

function ErrorPanel({
  kind,
  message,
  onRetry,
}: {
  kind: string;
  message: string;
  onRetry: () => void;
}) {
  const copy = errorCopyFor(kind, message);
  return (
    <DataCard eyebrow="ERROR">
      <p
        className="t-body"
        style={{
          color: 'var(--text-secondary)',
          margin: 0,
          fontSize: 13,
        }}
      >
        {copy}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="t-mono-data"
        style={{
          marginTop: 'var(--space-3)',
          padding: '8px 14px',
          background: 'transparent',
          color: 'var(--accent-cool)',
          border: '1px solid var(--accent-cool)',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 12,
        }}
      >
        Retry
      </button>
    </DataCard>
  );
}

function Drilldown({
  history,
  aep,
  turbine,
  hubHeightM,
  reconciliation,
}: {
  history: ReturnType<typeof useWindHistory>;
  aep: ReturnType<typeof useAep>;
  turbine: TurbineModel | undefined;
  hubHeightM: number;
  reconciliation: ReconciliationMetadata | null;
}) {
  const historyEyebrow =
    reconciliation && reconciliation.diagnostics ? 'Bias-corrected history' : 'Monthly history';
  return (
    <section
      style={{
        maxWidth: 1400,
        margin: '0 auto',
        padding: 'var(--space-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-7)',
      }}
    >
      <div>
        <SectionHeading eyebrow={historyEyebrow} align="left">
          Monthly wind history
        </SectionHeading>
        <HistorySection
          history={history}
          hubHeightM={hubHeightM}
          reconciliation={reconciliation}
        />
      </div>
      <div>
        <SectionHeading eyebrow="Direction" align="left">
          Wind rose
        </SectionHeading>
        <WindRoseSection history={history} />
      </div>
      <div>
        <SectionHeading eyebrow="Yield" align="left">
          Power curve and AEP
        </SectionHeading>
        <YieldSection aep={aep} turbine={turbine} />
      </div>
    </section>
  );
}

function WindRoseSection({
  history,
}: {
  history: ReturnType<typeof useWindHistory>;
}) {
  if (history.status === 'running') return <WindRoseSkeleton />;
  if (history.status === 'error' || !history.data) return <WindRoseEmpty />;
  const source = history.data.corrected ?? history.data.raw;
  return <WindRoseChart history={source} />;
}

function YieldSection({
  aep,
  turbine,
}: {
  aep: ReturnType<typeof useAep>;
  turbine: TurbineModel | undefined;
}) {
  if (!turbine) return <PowerCurveEmpty />;
  if (aep.status === 'running') return <PowerCurveSkeleton />;
  if (aep.status === 'error' || !aep.data) return <PowerCurveEmpty />;
  return <PowerCurveChart turbine={turbine} aep={aep.data} />;
}

function HistorySection({
  history,
  hubHeightM,
  reconciliation,
}: {
  history: ReturnType<typeof useWindHistory>;
  hubHeightM: number;
  reconciliation: ReconciliationMetadata | null;
}) {
  if (history.status === 'running') {
    return <MonthlyHistorySkeleton />;
  }
  if (history.status === 'error' || !history.data) {
    return <MonthlyHistoryEmpty />;
  }
  const reference = reconciliation?.reference ?? history.reconciliation?.reference ?? null;
  const diagnostics =
    reconciliation?.diagnostics ?? history.reconciliation?.diagnostics ?? null;
  return (
    <MonthlyHistoryChart
      raw={history.data.raw}
      corrected={history.data.corrected}
      hubHeightM={hubHeightM}
      reference={reference}
      diagnostics={diagnostics}
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="t-eyebrow" style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function McpCrossLink() {
  return (
    <div
      data-testid="mcp-cross-link"
      style={{
        borderTop: '1px solid var(--border-subtle)',
        paddingTop: 'var(--space-3)',
      }}
    >
      <a
        href="https://github.com/jamieblair/wind-site-intelligence/tree/main/packages/mcp"
        target="_blank"
        rel="noreferrer noopener"
        className="t-mono-data"
        style={{
          color: 'var(--text-secondary)',
          fontSize: 11,
          textDecoration: 'none',
          letterSpacing: '0.04em',
        }}
      >
        Want this from your AI agent? Use the WindForge MCP server →
      </a>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface-0)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 4,
  padding: '8px 12px',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  minWidth: 120,
};

const buttonStyle: React.CSSProperties = {
  padding: '10px 18px',
  borderRadius: 4,
  border: 'none',
  fontFamily: 'var(--font-sans)',
  fontWeight: 500,
  fontSize: 13,
};

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

function MobileFallback({
  valid,
  latNum,
  lngNum,
  lat,
  lng,
  setLat,
  setLng,
  status,
  data,
  error,
  onRun,
}: {
  valid: boolean;
  latNum: number;
  lngNum: number;
  lat: string;
  lng: string;
  setLat: (v: string) => void;
  setLng: (v: string) => void;
  status: 'idle' | 'running' | 'success' | 'error';
  data: SiteAnalysis | null;
  error: { code: string; message: string } | null;
  onRun: () => void;
}) {
  const wind = data?.factors.find((f) => f.factor === ScoringFactor.WindResource);
  return (
    <main
      data-testid="mobile-fallback"
      style={{
        minHeight: '100vh',
        background: 'var(--surface-0)',
        color: 'var(--text-primary)',
        padding: 'var(--space-5)',
      }}
    >
      <div
        style={{
          maxWidth: 480,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <Link
          href="/"
          className="t-mono-data"
          style={{ color: 'var(--text-secondary)', fontSize: 12, textDecoration: 'none' }}
        >
          ← WindForge
        </Link>
        <DataCard
          eyebrow="MOBILE"
          title="Text-only analysis"
        >
          <p
            className="t-body"
            style={{
              color: 'var(--text-secondary)',
              margin: 0,
              fontSize: 13,
            }}
          >
            For the full analysis view, open this page on a desktop. Or run a
            text-only analysis here.
          </p>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
              marginTop: 'var(--space-4)',
            }}
          >
            <Field label="Latitude">
              <input
                type="number"
                step="any"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                aria-label="Latitude"
                style={inputStyle}
              />
            </Field>
            <Field label="Longitude">
              <input
                type="number"
                step="any"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                aria-label="Longitude"
                style={inputStyle}
              />
            </Field>
            <button
              type="button"
              onClick={onRun}
              disabled={!valid || status === 'running'}
              style={{
                ...buttonStyle,
                background: valid ? 'var(--accent-cool)' : 'var(--surface-elevated)',
                color: valid ? '#0a0e1a' : 'var(--text-tertiary)',
                cursor: valid && status !== 'running' ? 'pointer' : 'not-allowed',
              }}
            >
              {status === 'running' ? 'Running…' : 'Run analysis'}
            </button>
          </div>
        </DataCard>
        {error ? (
          <DataCard eyebrow="ERROR">
            <span className="t-mono-data" style={{ color: 'var(--accent-warm)' }}>
              {error.code}
            </span>
            <p
              className="t-body"
              style={{ color: 'var(--text-secondary)', margin: '8px 0 0', fontSize: 13 }}
            >
              {error.message}
            </p>
          </DataCard>
        ) : null}
        {data ? (
          <>
            <DataCard eyebrow="OVERALL">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
                <span className="t-mono-large" data-testid="composite-score">
                  {data.compositeScore.toFixed(0)}
                </span>
                <span className="t-caption" style={{ color: 'var(--text-secondary)' }}>
                  / 100
                </span>
              </div>
            </DataCard>
            {wind ? <WindCard factor={wind} reconciliation={data.metadata.reconciliation} /> : null}
          </>
        ) : null}
        <p
          className="t-mono-data"
          style={{ color: 'var(--text-tertiary)', fontSize: 11, margin: 0 }}
        >
          {valid ? `${latNum.toFixed(2)}, ${lngNum.toFixed(2)}` : 'Coordinate not set'}
        </p>
      </div>
    </main>
  );
}
