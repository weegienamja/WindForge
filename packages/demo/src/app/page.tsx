'use client';

import { useState, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type {
  SiteAnalysis,
  WindTrendResult,
  BoxPlotData,
  SpeedDistributionResult,
  DiurnalProfileResult,
  SeasonalHeatmapResult,
  SiteBoundary,
  SiteConstraintReport,
  EnergyYieldResult,
  TurbineModel,
  TurbineLayoutEstimate,
} from '@jamieblair/wind-site-intelligence-core';
import {
  fetchMonthlyWindHistory,
  fetchDailyWindData,
  fetchHourlyWindData,
  computeWindTrend,
  computeMonthlyBoxPlots,
  computeSpeedDistribution,
  computeDiurnalProfile,
  computeSeasonalHeatmap,
  fetchConstraintData,
  detectConstraints,
  computeExclusionZones,
  fetchWindData,
  calculateAep,
  estimateTurbineCapacity,
} from '@jamieblair/wind-site-intelligence-core';

// ─── Quick Scan components ───

const WindSiteScorer = dynamic(
  () => import('@jamieblair/wind-site-intelligence').then((m) => m.WindSiteScorer),
  { ssr: false, loading: () => <div style={{ padding: '40px', textAlign: 'center' }}>Loading map...</div> },
);

const WindTrendChart = dynamic(
  () => import('@jamieblair/wind-site-intelligence').then((m) => m.WindTrendChart),
  { ssr: false },
);

const MonthlyBoxPlot = dynamic(
  () => import('@jamieblair/wind-site-intelligence').then((m) => m.MonthlyBoxPlot),
  { ssr: false },
);

const WindSpeedDistribution = dynamic(
  () => import('@jamieblair/wind-site-intelligence').then((m) => m.WindSpeedDistribution),
  { ssr: false },
);

const DiurnalProfile = dynamic(
  () => import('@jamieblair/wind-site-intelligence').then((m) => m.DiurnalProfile),
  { ssr: false },
);

const SeasonalHeatmap = dynamic(
  () => import('@jamieblair/wind-site-intelligence').then((m) => m.SeasonalHeatmap),
  { ssr: false },
);

// ─── Site Assessment components ───

const SiteBoundaryEditor = dynamic(
  () => import('@jamieblair/wind-site-intelligence').then((m) => m.SiteBoundaryEditor),
  { ssr: false },
);

const ConstraintPanel = dynamic(
  () => import('@jamieblair/wind-site-intelligence').then((m) => m.ConstraintPanel),
  { ssr: false },
);

const ConstraintMap = dynamic(
  () => import('@jamieblair/wind-site-intelligence').then((m) => m.ConstraintMap),
  { ssr: false },
);

const TurbineSelector = dynamic(
  () => import('@jamieblair/wind-site-intelligence').then((m) => m.TurbineSelector),
  { ssr: false },
);

const EnergyYieldCard = dynamic(
  () => import('@jamieblair/wind-site-intelligence').then((m) => m.EnergyYieldCard),
  { ssr: false },
);

// ─── Types ───

type Tab = 'quickScan' | 'siteAssessment';

interface ChartData {
  trend?: WindTrendResult;
  boxPlots?: BoxPlotData[];
  distribution?: SpeedDistributionResult;
  diurnal?: DiurnalProfileResult;
  seasonal?: SeasonalHeatmapResult;
}

// ─── Tab button styles ───

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '10px 24px',
  border: 'none',
  borderBottom: active ? '2px solid #22c55e' : '2px solid transparent',
  background: 'transparent',
  color: active ? '#fff' : 'rgba(255,255,255,0.6)',
  fontWeight: active ? 600 : 400,
  fontSize: '0.95rem',
  cursor: 'pointer',
  transition: 'all 0.15s',
});

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<Tab>('quickScan');

  // ─── Quick Scan state ───
  const [chartData, setChartData] = useState<ChartData>({});
  const [chartsLoading, setChartsLoading] = useState(false);
  const chartAbortRef = useRef<AbortController | null>(null);

  // ─── Site Assessment state ───
  const [boundary, setBoundary] = useState<SiteBoundary | null>(null);
  const [constraintReport, setConstraintReport] = useState<SiteConstraintReport | null>(null);
  const [selectedTurbine, setSelectedTurbine] = useState<TurbineModel | null>(null);
  const [energyResult, setEnergyResult] = useState<EnergyYieldResult | null>(null);
  const [layoutEstimate, setLayoutEstimate] = useState<TurbineLayoutEstimate | null>(null);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);

  // ─── Quick Scan handler ───

  const handleAnalysisComplete = useCallback(async (analysis: SiteAnalysis) => {
    console.log('Analysis complete:', analysis);

    chartAbortRef.current?.abort();
    const controller = new AbortController();
    chartAbortRef.current = controller;
    const { signal } = controller;

    setChartsLoading(true);

    const { coordinate } = analysis;
    const endYear = new Date().getFullYear() - 1;
    const dailyStart = `${endYear}-01-01`;
    const dailyEnd = `${endYear}-12-31`;
    const hourlyStart = `${endYear}-12-01`;
    const hourlyEnd = `${endYear}-12-31`;

    const [monthlyResult, dailyResult, hourlyResult] = await Promise.allSettled([
      fetchMonthlyWindHistory(coordinate, 10, signal),
      fetchDailyWindData(coordinate, dailyStart, dailyEnd, signal),
      fetchHourlyWindData(coordinate, hourlyStart, hourlyEnd, signal),
    ]);

    if (signal.aborted) return;

    const newChartData: ChartData = {};

    if (monthlyResult.status === 'fulfilled' && monthlyResult.value.ok) {
      const history = monthlyResult.value.value;
      newChartData.trend = computeWindTrend(history);
      newChartData.boxPlots = computeMonthlyBoxPlots(history);
    }

    if (dailyResult.status === 'fulfilled' && dailyResult.value.ok) {
      newChartData.distribution = computeSpeedDistribution(dailyResult.value.value);
    }

    if (hourlyResult.status === 'fulfilled' && hourlyResult.value.ok) {
      const hourly = hourlyResult.value.value;
      newChartData.diurnal = computeDiurnalProfile(hourly);
      newChartData.seasonal = computeSeasonalHeatmap(hourly);
    }

    setChartData(newChartData);
    setChartsLoading(false);
  }, []);

  // ─── Site Assessment handlers ───

  const handleBoundaryChange = useCallback((b: SiteBoundary | null) => {
    setBoundary(b);
    setConstraintReport(null);
    setEnergyResult(null);
    setLayoutEstimate(null);
    setAssessmentError(null);
  }, []);

  const handleRunConstraints = useCallback(async () => {
    if (!boundary) return;
    setAssessmentLoading(true);
    setAssessmentError(null);
    try {
      const osmResult = await fetchConstraintData(boundary);
      if (!osmResult.ok) {
        setAssessmentError('Failed to fetch constraint data');
        return;
      }
      const report = detectConstraints(boundary, osmResult.value);
      setConstraintReport(report);
    } catch {
      setAssessmentError('An error occurred during constraint analysis');
    } finally {
      setAssessmentLoading(false);
    }
  }, [boundary]);

  const handleTurbineSelect = useCallback((turbine: TurbineModel) => {
    setSelectedTurbine(turbine);
    setEnergyResult(null);
    setLayoutEstimate(null);
  }, []);

  const handleRunEnergy = useCallback(async () => {
    if (!boundary || !selectedTurbine) return;
    setAssessmentLoading(true);
    setAssessmentError(null);
    try {
      const centroid = boundary.centroid;
      const windResult = await fetchWindData(centroid);
      if (!windResult.ok) {
        setAssessmentError('Failed to fetch wind data for the site');
        return;
      }

      const exclusionZones = constraintReport
        ? computeExclusionZones(boundary, constraintReport.hardConstraints)
        : [];
      const layout = estimateTurbineCapacity(boundary, selectedTurbine, windResult.value, exclusionZones);
      setLayoutEstimate(layout);

      if (layout.turbineCount > 0) {
        const aepResult = calculateAep(windResult.value, selectedTurbine, {
          turbineCount: layout.turbineCount,
          hubHeightM: selectedTurbine.hubHeightOptionsM[0],
        });
        if (aepResult.ok) {
          setEnergyResult(aepResult.value);
        } else {
          setAssessmentError('AEP calculation failed');
        }
      } else {
        setAssessmentError('No valid turbine positions found within the site boundary');
      }
    } catch {
      setAssessmentError('An error occurred during energy yield estimation');
    } finally {
      setAssessmentLoading(false);
    }
  }, [boundary, selectedTurbine, constraintReport]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Hero */}
      <header
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
          color: '#fff',
          padding: '48px 20px 16px',
          textAlign: 'center',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
          Wind Site Intelligence
        </h1>
        <p style={{ margin: '12px auto 0', maxWidth: 600, fontSize: '1.05rem', opacity: 0.85, lineHeight: 1.5 }}>
          Click any location on the map to score wind resource, terrain, grid proximity, land use and planning
          feasibility - powered entirely by free, open data.
        </p>

        {/* Tab navigation */}
        <nav style={{ marginTop: 24, display: 'flex', justifyContent: 'center', gap: 4 }}>
          <button style={tabStyle(activeTab === 'quickScan')} onClick={() => setActiveTab('quickScan')}>
            Quick Scan
          </button>
          <button style={tabStyle(activeTab === 'siteAssessment')} onClick={() => setActiveTab('siteAssessment')}>
            Site Assessment
          </button>
        </nav>
      </header>

      {/* Main content */}
      <main style={{ flex: 1, padding: '40px 20px', maxWidth: 1400, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* ─── Quick Scan Tab ─── */}
        {activeTab === 'quickScan' && (
          <>
            <WindSiteScorer
              defaultCenter={{ lat: 55.86, lng: -4.25 }}
              defaultZoom={8}
              hubHeightM={80}
              theme={{ primary: '#0f172a', accent: '#22c55e' }}
              onAnalysisComplete={handleAnalysisComplete}
            />

            {chartsLoading && (
              <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
                Loading historical wind analysis charts...
              </div>
            )}

            {!chartsLoading && Object.keys(chartData).length > 0 && (
              <div style={{ marginTop: 32, display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(min(500px, 100%), 1fr))' }}>
                {chartData.trend && <WindTrendChart data={chartData.trend} height={280} />}
                {chartData.boxPlots && <MonthlyBoxPlot data={chartData.boxPlots} height={280} />}
                {chartData.distribution && <WindSpeedDistribution data={chartData.distribution} height={280} />}
                {chartData.diurnal && <DiurnalProfile data={chartData.diurnal} height={280} />}
                {chartData.seasonal && <SeasonalHeatmap data={chartData.seasonal} width={600} height={320} />}
              </div>
            )}
          </>
        )}

        {/* ─── Site Assessment Tab ─── */}
        {activeTab === 'siteAssessment' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {/* Step 1: Define boundary */}
            <section>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 12, color: '#1e293b' }}>
                1. Define Site Boundary
              </h2>
              <SiteBoundaryEditor onBoundaryChange={handleBoundaryChange} />
              {boundary && (
                <div style={{ marginTop: 12, padding: 12, background: '#f0fdf4', borderRadius: 8, fontSize: '0.875rem', color: '#166534' }}>
                  Boundary created: {boundary.name} - {boundary.areaSqKm.toFixed(2)} km² with {boundary.polygon.length} vertices
                </div>
              )}
            </section>

            {/* Step 2: Run constraints */}
            {boundary && (
              <section>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 12, color: '#1e293b' }}>
                  2. Constraint Analysis
                </h2>
                <button
                  onClick={handleRunConstraints}
                  disabled={assessmentLoading}
                  style={{
                    padding: '10px 24px',
                    background: assessmentLoading ? '#94a3b8' : '#0f172a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    cursor: assessmentLoading ? 'not-allowed' : 'pointer',
                    fontSize: '0.9rem',
                  }}
                >
                  {assessmentLoading ? 'Analysing...' : 'Run Constraint Analysis'}
                </button>

                {constraintReport && (
                  <div style={{ marginTop: 16, display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))' }}>
                    <ConstraintPanel report={constraintReport} />
                    <ConstraintMap boundaryPolygon={boundary.polygon} report={constraintReport} />
                  </div>
                )}
              </section>
            )}

            {/* Step 3: Select turbine */}
            {boundary && (
              <section>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 12, color: '#1e293b' }}>
                  3. Select Turbine Model
                </h2>
                <TurbineSelector
                  selectedTurbineId={selectedTurbine?.id ?? null}
                  onSelect={handleTurbineSelect}
                />
              </section>
            )}

            {/* Step 4: Energy yield */}
            {boundary && selectedTurbine && (
              <section>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 12, color: '#1e293b' }}>
                  4. Energy Yield Estimation
                </h2>
                <button
                  onClick={handleRunEnergy}
                  disabled={assessmentLoading}
                  style={{
                    padding: '10px 24px',
                    background: assessmentLoading ? '#94a3b8' : '#16a34a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    cursor: assessmentLoading ? 'not-allowed' : 'pointer',
                    fontSize: '0.9rem',
                  }}
                >
                  {assessmentLoading ? 'Calculating...' : 'Calculate Energy Yield'}
                </button>

                {layoutEstimate && (
                  <div style={{ marginTop: 12, padding: 12, background: '#eff6ff', borderRadius: 8, fontSize: '0.875rem', color: '#1e40af' }}>
                    Layout: {layoutEstimate.turbineCount} turbines, {layoutEstimate.estimatedInstalledCapacityMw.toFixed(1)} MW installed capacity,
                    viable area: {layoutEstimate.viableAreaSqKm.toFixed(2)} km²
                  </div>
                )}

                {energyResult && <EnergyYieldCard result={energyResult} />}
              </section>
            )}

            {/* Error display */}
            {assessmentError && (
              <div style={{ padding: 16, background: '#fef2f2', borderRadius: 8, color: '#991b1b', fontSize: '0.9rem' }}>
                {assessmentError}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid #e2e8f0',
          padding: '20px',
          textAlign: 'center',
          fontSize: '0.875rem',
          color: '#64748b',
        }}
      >
        Built by{' '}
        <a href="https://jamieblair.co.uk" style={{ color: '#334155', textDecoration: 'underline' }}>
          Jamie Blair
        </a>{' '}
        · Open source on{' '}
        <a
          href="https://github.com/jamieblair/wind-site-intelligence"
          style={{ color: '#334155', textDecoration: 'underline' }}
        >
          GitHub
        </a>
      </footer>
    </div>
  );
}
