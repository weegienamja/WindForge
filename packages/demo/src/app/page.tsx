'use client';

import { useState, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { SiteAnalysis, WindTrendResult, BoxPlotData, SpeedDistributionResult, DiurnalProfileResult, SeasonalHeatmapResult } from '@jamieblair/wind-site-intelligence-core';
import { fetchMonthlyWindHistory, fetchDailyWindData, fetchHourlyWindData, computeWindTrend, computeMonthlyBoxPlots, computeSpeedDistribution, computeDiurnalProfile, computeSeasonalHeatmap } from '@jamieblair/wind-site-intelligence-core';

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

interface ChartData {
  trend?: WindTrendResult;
  boxPlots?: BoxPlotData[];
  distribution?: SpeedDistributionResult;
  diurnal?: DiurnalProfileResult;
  seasonal?: SeasonalHeatmapResult;
}

export default function HomePage() {
  const [chartData, setChartData] = useState<ChartData>({});
  const [chartsLoading, setChartsLoading] = useState(false);
  const chartAbortRef = useRef<AbortController | null>(null);

  const handleAnalysisComplete = useCallback(async (analysis: SiteAnalysis) => {
    console.log('Analysis complete:', analysis);

    // Abort any in-flight chart fetches
    chartAbortRef.current?.abort();
    const controller = new AbortController();
    chartAbortRef.current = controller;
    const { signal } = controller;

    setChartsLoading(true);

    const { coordinate } = analysis;
    const endYear = new Date().getFullYear() - 1;
    const dailyStart = `${endYear}-01-01`;
    const dailyEnd = `${endYear}-12-31`;
    // Hourly: last 30 days of most recent complete year
    const hourlyStart = `${endYear}-12-01`;
    const hourlyEnd = `${endYear}-12-31`;

    const [monthlyResult, dailyResult, hourlyResult] = await Promise.allSettled([
      fetchMonthlyWindHistory(coordinate, 10, signal),
      fetchDailyWindData(coordinate, dailyStart, dailyEnd, signal),
      fetchHourlyWindData(coordinate, hourlyStart, hourlyEnd, signal),
    ]);

    // Ignore results if this request was superseded
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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Hero */}
      <header
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
          color: '#fff',
          padding: '48px 20px 40px',
          textAlign: 'center',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
          Wind Site Intelligence
        </h1>
        <p style={{ margin: '12px auto 0', maxWidth: 600, fontSize: '1.05rem', opacity: 0.85, lineHeight: 1.5 }}>
          Click any location on the map to score wind resource, terrain, grid proximity, land use and planning feasibility - powered entirely by free, open data.
        </p>
      </header>

      {/* Main content */}
      <main style={{ flex: 1, padding: '40px 20px', maxWidth: 1400, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
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
