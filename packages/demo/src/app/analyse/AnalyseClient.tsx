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
import {
  useGeocodeSearch,
  useReverseGeocode,
  type GeocodeHit,
  type UseGeocodeSearchReturn,
} from '../../hooks/useGeocode';
import { errorCopyFor } from '../../lib/errorCopy';

const HUB_OPTIONS = [80, 100, 120, 140] as const;
type Hub = (typeof HUB_OPTIONS)[number];

/**
 * Notable strong-wind locations for one-tap exploration from the empty state.
 * Picked to span open coast, upland and offshore-adjacent sites.
 */
const EXAMPLE_SITES: ReadonlyArray<{ name: string; lat: number; lng: number }> = [
  { name: 'Lewis, Outer Hebrides', lat: 58.21, lng: -6.39 },
  { name: 'Caithness, Scotland', lat: 58.44, lng: -3.52 },
  { name: 'Anholt, Denmark (offshore)', lat: 56.6, lng: 11.21 },
  { name: 'Gansu Corridor, China', lat: 39.74, lng: 98.49 },
  { name: 'Oaxaca Isthmus, Mexico', lat: 16.5, lng: -94.9 },
];

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
  const geocode = useGeocodeSearch();

  const selectedTurbine = useMemo(
    () => turbines.find((t) => t.id === turbineId) ?? defaultTurbine,
    [turbines, turbineId, defaultTurbine],
  );

  const latNum = Number(lat);
  const lngNum = Number(lng);
  const valid =
    lat.trim() !== '' && lng.trim() !== '' && clampLat(latNum) && clampLng(lngNum);

  // Single entry point for kicking off an analysis at a coordinate. Used by the
  // Run button, the location search, the example chips and map clicks alike, so
  // every path keeps the URL, inputs and the three data hooks in lockstep.
  const runAt = useCallback(
    (la: number, ln: number, hh: Hub) => {
      if (!clampLat(la) || !clampLng(ln)) return;
      setLat(String(la));
      setLng(String(ln));
      setHub(hh);
      const params = new URLSearchParams();
      params.set('lat', String(la));
      params.set('lng', String(ln));
      params.set('hub', String(hh));
      router.replace(`/analyse?${params.toString()}`);
      // Kick off the wind-history fetch in parallel so the chart starts
      // loading the moment the analysis is requested.
      history.run({ lat: la, lng: ln });
      if (selectedTurbine) {
        aep.run({ coordinate: { lat: la, lng: ln }, turbine: selectedTurbine, hubHeightM: hh });
      }
      void run({ coordinate: { lat: la, lng: ln }, hubHeightM: hh });
    },
    [router, run, history, aep, selectedTurbine],
  );

  const submit = useCallback(() => {
    if (!valid) return;
    runAt(latNum, lngNum, hub);
  }, [valid, latNum, lngNum, hub, runAt]);

  const selectPlace = useCallback(
    (place: { lat: number; lng: number }) => {
      geocode.clear();
      geocode.setQuery('');
      runAt(place.lat, place.lng, hub);
    },
    [geocode, runAt, hub],
  );

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

  const placeName = useReverseGeocode(coordinate);

  // Responsive control styling: on narrow viewports the form fields and action
  // buttons go full-width and stack vertically.
  const controlStyle: React.CSSProperties = isMobile
    ? { ...inputStyle, width: '100%', minWidth: 0 }
    : inputStyle;

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
          // The stacked mobile form is tall, so only pin it on wider screens
          // where it stays a single compact row.
          position: isMobile ? 'static' : 'sticky',
          top: 0,
          zIndex: 10,
          background: 'var(--surface-1)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: isMobile ? 'var(--space-4)' : 'var(--space-3) var(--space-5)',
        }}
      >
        <div
          style={{
            maxWidth: 1400,
            margin: '0 auto',
            display: 'flex',
            flexWrap: 'wrap',
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: isMobile ? 'stretch' : 'flex-end',
            gap: 'var(--space-3)',
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
          <LocationSearch
            geocode={geocode}
            onSelect={selectPlace}
            controlStyle={controlStyle}
            isMobile={isMobile}
          />
          <Field label="Latitude">
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              aria-invalid={!valid && lat !== ''}
              aria-label="Latitude"
              style={controlStyle}
            />
          </Field>
          <Field label="Longitude">
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              aria-invalid={!valid && lng !== ''}
              aria-label="Longitude"
              style={controlStyle}
            />
          </Field>
          <Field label="Hub height">
            <select
              value={hub}
              onChange={(e) => setHub(Number(e.target.value) as Hub)}
              aria-label="Hub height"
              style={controlStyle}
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
              style={controlStyle}
            >
              {turbines.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.manufacturer} {t.model} ({(t.ratedPowerKw / 1000).toFixed(1)} MW)
                </option>
              ))}
            </select>
          </Field>
          <div style={{ display: 'flex', gap: 8, width: isMobile ? '100%' : 'auto' }}>
            <button
              type="button"
              onClick={submit}
              disabled={!valid || status === 'running'}
              style={{
                ...buttonStyle,
                flex: isMobile ? 1 : undefined,
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
          padding: isMobile ? 'var(--space-4)' : 'var(--space-5)',
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 60%) minmax(0, 40%)',
          gap: isMobile ? 'var(--space-4)' : 'var(--space-5)',
        }}
      >
        <div style={{ minHeight: isMobile ? 320 : 480 }}>
          <MapPanel
            coordinate={coordinate}
            loading={status === 'running'}
            minHeight={isMobile ? 320 : 480}
            onPick={(c) => runAt(c.lat, c.lng, hub)}
          />
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          {coordinate ? (
            <LocationBadge coordinate={coordinate} placeName={placeName} />
          ) : null}
          {status === 'idle' && !data && !error ? (
            <EmptyState onPickExample={(s) => runAt(s.lat, s.lng, hub)} />
          ) : null}
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
  const byFactor = (f: ScoringFactor) => analysis.factors.find((x) => x.factor === f);
  const wind = byFactor(ScoringFactor.WindResource);
  const grid = byFactor(ScoringFactor.GridProximity);
  const access = byFactor(ScoringFactor.AccessLogistics);
  const terrain = byFactor(ScoringFactor.TerrainSuitability);
  const landUse = byFactor(ScoringFactor.LandUseCompatibility);
  const planning = byFactor(ScoringFactor.PlanningFeasibility);
  const reconciliation = analysis.metadata.reconciliation;

  return (
    <>
      <CompositeCard
        score={analysis.compositeScore}
        factors={analysis.factors}
        confidence={inferOverallConfidence(analysis.factors)}
      />
      <WindCard factor={wind} reconciliation={reconciliation} />
      <FactorCard eyebrow="TERRAIN" factor={terrain} />
      <ConstraintsCard
        hardConstraints={analysis.hardConstraints}
        warnings={analysis.warnings}
      />
      <GridCard gridFactor={grid} accessFactor={access} />
      <FactorCard eyebrow="LAND USE" factor={landUse} />
      <FactorCard eyebrow="PLANNING" factor={planning} />
      <DiagnosticsCard metadata={analysis.metadata} />
    </>
  );
}

/**
 * Generic single-factor card: a score readout plus the engine's explanatory
 * detail string. Used for the factors that don't have a bespoke card.
 */
function FactorCard({ eyebrow, factor }: { eyebrow: string; factor?: FactorScore }) {
  if (!factor) return null;
  const hard = factor.score < 20;
  return (
    <DataCard eyebrow={eyebrow}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
        <span
          className="t-mono-data"
          style={{ fontSize: 22, color: hard ? 'var(--accent-warm)' : 'var(--text-primary)' }}
        >
          {Math.round(Math.max(0, Math.min(100, factor.score)))}
        </span>
        <span className="t-caption" style={{ color: 'var(--text-secondary)' }}>
          / 100
        </span>
        <ConfidenceBadge confidence={factor.confidence} />
      </div>
      <p
        className="t-body"
        style={{
          color: 'var(--text-secondary)',
          margin: 'var(--space-3) 0 0',
          fontSize: 13,
        }}
      >
        {factor.detail}
      </p>
    </DataCard>
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

function EmptyState({
  onPickExample,
}: {
  onPickExample: (site: { lat: number; lng: number }) => void;
}) {
  return (
    <DataCard eyebrow="NO ANALYSIS" title="Search, click the map, or enter a coordinate">
      <p
        className="t-body"
        style={{ color: 'var(--text-secondary)', margin: 0, fontSize: 13 }}
      >
        Run a six-factor wind site suitability analysis anywhere on Earth.
        NASA POWER for wind resource. ERA5 and CERRA reanalysis for bias
        correction. Open-Elevation for terrain. OpenStreetMap for grid
        infrastructure and constraints.
      </p>
      <div style={{ marginTop: 'var(--space-4)' }}>
        <div className="t-eyebrow" style={{ marginBottom: 'var(--space-2)' }}>
          Try a strong-wind site
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {EXAMPLE_SITES.map((site) => (
            <button
              key={site.name}
              type="button"
              onClick={() => onPickExample(site)}
              className="t-mono-data"
              style={{
                background: 'var(--surface-0)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 4,
                color: 'var(--accent-cool)',
                padding: '6px 10px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {site.name}
            </button>
          ))}
        </div>
      </div>
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
        href="https://github.com/weegienamja/WindForge/tree/main/packages/mcp"
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

/**
 * Place-name search box with a results dropdown. Typing queries `/api/geocode`
 * (debounced); choosing a result hands its coordinate back to the page.
 */
function LocationSearch({
  geocode,
  onSelect,
  controlStyle,
  isMobile,
}: {
  geocode: UseGeocodeSearchReturn;
  onSelect: (hit: GeocodeHit) => void;
  controlStyle: React.CSSProperties;
  isMobile: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const open = focused && (geocode.results.length > 0 || geocode.loading);

  return (
    <div style={{ position: 'relative', flex: isMobile ? undefined : '1 1 260px', minWidth: 0 }}>
      <Field label="Search location">
        <input
          type="search"
          value={geocode.query}
          onChange={(e) => geocode.setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          // Delay blur so a click on a result registers before the list unmounts.
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && geocode.results[0]) {
              e.preventDefault();
              onSelect(geocode.results[0]);
            }
          }}
          placeholder="e.g. Stornoway, or a town, region…"
          aria-label="Search location"
          style={{ ...controlStyle, width: '100%' }}
        />
      </Field>
      {open ? (
        <ul
          role="listbox"
          aria-label="Location results"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 20,
            listStyle: 'none',
            margin: 0,
            padding: 4,
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border-strong)',
            borderRadius: 4,
            maxHeight: 280,
            overflowY: 'auto',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {geocode.loading && geocode.results.length === 0 ? (
            <li className="t-mono-data" style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-tertiary)' }}>
              Searching…
            </li>
          ) : null}
          {geocode.results.map((hit) => (
            <li key={`${hit.lat},${hit.lng}`}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                // onMouseDown fires before input blur, so the selection lands.
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(hit);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  padding: '8px 10px',
                  borderRadius: 3,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--surface-1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                {hit.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Compact chip above the results column showing the reverse-geocoded place name
 * (when resolved) and the precise coordinate being analysed.
 */
function LocationBadge({
  coordinate,
  placeName,
}: {
  coordinate: { lat: number; lng: number };
  placeName: string | null;
}) {
  return (
    <div
      data-testid="location-badge"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'baseline',
        gap: 'var(--space-2)',
      }}
    >
      <span className="t-eyebrow" style={{ color: 'var(--text-tertiary)' }}>
        Location
      </span>
      {placeName ? (
        <span className="t-body" style={{ fontSize: 14, color: 'var(--text-primary)' }}>
          {placeName}
        </span>
      ) : null}
      <span className="t-mono-data" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        {coordinate.lat.toFixed(4)}, {coordinate.lng.toFixed(4)}
      </span>
    </div>
  );
}
