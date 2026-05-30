/**
 * Reanalysis bias-correction demo.
 *
 * When `CDS_API_KEY` is set in the environment, this page runs a real
 * `analyseSite` call for East Kilbride (55.7644, -4.1770). The engine
 * auto-fetches ERA5 (and CERRA, since East Kilbride is in the European
 * domain) from the Copernicus CDS, reconciles NASA POWER against them,
 * and renders the diagnostics produced by `reconcileWindData`.
 *
 * Without a key, the page falls back to a synthetic demonstration so
 * the diagnostics UI is still inspectable.
 */

import type { ReactElement } from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import { Footer } from '../../components/Footer';
import {
  analyseSite,
  reconcileWindData,
  type MonthlyWindHistory,
  type SiteAnalysis,
  type WindDataSummary,
  type ReconciledWindData,
  type ReconciliationMetadata,
} from '@jamieblair/windforge-core';

const COORD = { lat: 55.7644, lng: -4.177 } as const;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function ReanalysisDemoPage(): ReactElement {
  const hasKey = (process.env.CDS_API_KEY ?? '').trim().length > 0;

  return (
    <main style={{ minHeight: '100vh', background: 'var(--surface-0)' }}>
      <div style={containerStyle}>
        <Link
          href="/"
          className="t-mono-data"
          style={{
            color: 'var(--text-secondary)',
            fontSize: 12,
            textDecoration: 'none',
            display: 'inline-block',
            marginBottom: 'var(--space-5)',
          }}
        >
          ← WindForge
        </Link>
        <div className="t-eyebrow">Reanalysis</div>
        <h1 className="t-h1" style={{ margin: 'var(--space-2) 0 var(--space-3)' }}>
          Bias correction
        </h1>
        <p className="t-body" style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
          East Kilbride ({COORD.lat}, {COORD.lng}).{' '}
          {hasKey
            ? 'Live ERA5 / CERRA from Copernicus CDS.'
            : 'Synthetic NASA POWER reconciled against synthetic ERA5 (set CDS_API_KEY for live data).'}
        </p>

        {hasKey ? (
          <Suspense fallback={<LoadingNotice />}>
            <LiveReconciliation />
          </Suspense>
        ) : (
          <SyntheticReconciliation />
        )}
      </div>
      <Footer />
    </main>
  );
}

function LoadingNotice(): ReactElement {
  return (
    <section style={cardStyle}>
      <p style={{ margin: 0 }}>
        Fetching ERA5 from Copernicus CDS, this may take a few minutes on a
        cold cache. Subsequent requests are served from the 7-day cache.
      </p>
    </section>
  );
}

async function LiveReconciliation(): Promise<ReactElement> {
  const result = await analyseSite({ coordinate: COORD });

  if (!result.ok) {
    return (
      <section style={cardStyle}>
        <h2 className="t-h3" style={{ marginTop: 0, marginBottom: 'var(--space-3)' }}>Analysis failed</h2>
        <p>{result.error.message}</p>
      </section>
    );
  }

  const meta = result.value.metadata;
  if (!meta.reconciliation) {
    return (
      <section style={cardStyle}>
        <h2 className="t-h3" style={{ marginTop: 0, marginBottom: 'var(--space-3)' }}>No reconciliation</h2>
        <p>
          Reanalysis was not applied. Attempted:{' '}
          {meta.reanalysisAttempted?.join(', ') ?? 'none'}. Succeeded:{' '}
          {meta.reanalysisSucceeded?.join(', ') ?? 'none'}.
        </p>
        <p>Sources failed: {meta.sourcesFailed.join(', ') || 'none'}.</p>
      </section>
    );
  }

  return <LiveDiagnostics analysis={result.value} reconciliation={meta.reconciliation} />;
}

function LiveDiagnostics({
  analysis,
  reconciliation,
}: {
  analysis: SiteAnalysis;
  reconciliation: ReconciliationMetadata;
}): ReactElement {
  const meta = analysis.metadata;
  return (
    <>
      <section style={cardStyle}>
        <h2 className="t-h3" style={{ marginTop: 0, marginBottom: 'var(--space-3)' }}>Method &amp; reference</h2>
        <table style={tableStyle}>
          <tbody>
            <tr>
              <th style={thStyle}>Method</th>
              <td style={tdStyle}>{reconciliation.method}</td>
            </tr>
            <tr>
              <th style={thStyle}>Reference</th>
              <td style={tdStyle}>{reconciliation.reference ?? 'none'}</td>
            </tr>
            <tr>
              <th style={thStyle}>Confidence</th>
              <td style={tdStyle}>{reconciliation.confidence}</td>
            </tr>
            <tr>
              <th style={thStyle}>Reanalysis attempted</th>
              <td style={tdStyle}>{meta.reanalysisAttempted?.join(', ') ?? 'none'}</td>
            </tr>
            <tr>
              <th style={thStyle}>Reanalysis succeeded</th>
              <td style={tdStyle}>{meta.reanalysisSucceeded?.join(', ') ?? 'none'}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {reconciliation.diagnostics && (
        <section style={cardStyle}>
          <h2 className="t-h3" style={{ marginTop: 0, marginBottom: 'var(--space-3)' }}>Diagnostics</h2>
          <table style={tableStyle}>
            <tbody>
              <tr><th style={thStyle}>Overlap months</th><td style={tdStyle}>{reconciliation.diagnostics.overlapMonths}</td></tr>
              <tr><th style={thStyle}>Bias before</th><td style={tdStyle}>{reconciliation.diagnostics.biasBeforeMs.toFixed(3)} m/s</td></tr>
              <tr><th style={thStyle}>Bias after</th><td style={tdStyle}>{reconciliation.diagnostics.biasAfterMs.toFixed(3)} m/s</td></tr>
              <tr><th style={thStyle}>RMSE before</th><td style={tdStyle}>{reconciliation.diagnostics.rmseBeforeMs.toFixed(3)} m/s</td></tr>
              <tr><th style={thStyle}>RMSE after</th><td style={tdStyle}>{reconciliation.diagnostics.rmseAfterMs.toFixed(3)} m/s</td></tr>
              <tr><th style={thStyle}>R²</th><td style={tdStyle}>{reconciliation.diagnostics.rSquared.toFixed(3)}</td></tr>
              <tr><th style={thStyle}>KS statistic</th><td style={tdStyle}>{reconciliation.diagnostics.ksStatistic.toFixed(3)}</td></tr>
            </tbody>
          </table>
        </section>
      )}

      <p className="t-body" style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
        {reconciliation.detail}
      </p>
    </>
  );
}

function makeHistory(bias: number, noiseSeed: number, months = 36): MonthlyWindHistory {
  let s = noiseSeed >>> 0;
  const rng = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  const records = [];
  for (let i = 0; i < months; i++) {
    const year = 2020 + Math.floor(i / 12);
    const month = (i % 12) + 1;
    const seasonal = 7.5 + 1.8 * Math.cos((2 * Math.PI * (month - 1)) / 12);
    const noise = (rng() - 0.5) * 1.2;
    const truth = seasonal + noise;
    const ws50m = truth + bias;
    records.push({
      year,
      month,
      ws2m: ws50m * 0.55,
      ws10m: ws50m * 0.85,
      ws50m,
      wd10m: 240,
      wd50m: 240,
    });
  }
  return {
    coordinate: COORD,
    records,
    startYear: 2020,
    endYear: 2020 + Math.ceil(months / 12) - 1,
  };
}

function summarise(history: MonthlyWindHistory, dataYears: number): WindDataSummary {
  const speeds = history.records.map((r) => r.ws50m);
  const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  const variance = speeds.reduce((a, b) => a + (b - mean) ** 2, 0) / speeds.length;
  return {
    coordinate: COORD,
    monthlyAverages: history.records.map((r) => ({
      month: r.month,
      averageSpeedMs: r.ws50m,
      averageDirectionDeg: r.wd50m,
    })),
    annualAverageSpeedMs: mean,
    speedStdDevMs: Math.sqrt(variance),
    prevailingDirectionDeg: 240,
    directionalConsistency: 0.7,
    dataYears,
    referenceHeightM: 50,
  };
}

function SyntheticReconciliation(): ReactElement {
  const nasaHistory = makeHistory(-0.6, 42);
  const era5History = makeHistory(0, 99);
  const result = reconcileWindData({
    nasa: { summary: summarise(nasaHistory, 1), history: nasaHistory },
    era5: { summary: summarise(era5History, 5), history: era5History },
    cerra: null,
  });
  if (!result.ok) {
    return <section style={cardStyle}>Reconciliation failed.</section>;
  }
  const reconciled: ReconciledWindData = result.value;
  const rawNasaMean =
    reconciled.corrected.annualAverageSpeedMs - (reconciled.diagnostics?.biasBeforeMs ?? 0);

  return (
    <>
      <section style={cardStyle}>
        <h2 className="t-h3" style={{ marginTop: 0, marginBottom: 'var(--space-3)' }}>Mean wind speed (50 m)</h2>
        <table style={tableStyle}>
          <tbody>
            <tr>
              <th style={thStyle}>Raw NASA POWER</th>
              <td style={tdStyle}>{rawNasaMean.toFixed(2)} m/s</td>
            </tr>
            <tr>
              <th style={thStyle}>Bias-corrected</th>
              <td style={tdStyle}>
                <strong>{reconciled.corrected.annualAverageSpeedMs.toFixed(2)} m/s</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section style={cardStyle}>
        <h2 className="t-h3" style={{ marginTop: 0, marginBottom: 'var(--space-3)' }}>Method &amp; reference</h2>
        <table style={tableStyle}>
          <tbody>
            <tr>
              <th style={thStyle}>Method</th>
              <td style={tdStyle}>{reconciled.method}</td>
            </tr>
            <tr>
              <th style={thStyle}>Reference</th>
              <td style={tdStyle}>{reconciled.reference ?? 'none'}</td>
            </tr>
            <tr>
              <th style={thStyle}>Confidence</th>
              <td style={tdStyle}>{reconciled.confidence}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {reconciled.diagnostics && (
        <section style={cardStyle}>
          <h2 className="t-h3" style={{ marginTop: 0, marginBottom: 'var(--space-3)' }}>Diagnostics</h2>
          <table style={tableStyle}>
            <tbody>
              <tr><th style={thStyle}>Overlap months</th><td style={tdStyle}>{reconciled.diagnostics.overlapMonths}</td></tr>
              <tr><th style={thStyle}>Bias before</th><td style={tdStyle}>{reconciled.diagnostics.biasBeforeMs.toFixed(3)} m/s</td></tr>
              <tr><th style={thStyle}>Bias after</th><td style={tdStyle}>{reconciled.diagnostics.biasAfterMs.toFixed(3)} m/s</td></tr>
              <tr><th style={thStyle}>RMSE before</th><td style={tdStyle}>{reconciled.diagnostics.rmseBeforeMs.toFixed(3)} m/s</td></tr>
              <tr><th style={thStyle}>RMSE after</th><td style={tdStyle}>{reconciled.diagnostics.rmseAfterMs.toFixed(3)} m/s</td></tr>
              <tr><th style={thStyle}>R²</th><td style={tdStyle}>{reconciled.diagnostics.rSquared.toFixed(3)}</td></tr>
              <tr><th style={thStyle}>KS statistic</th><td style={tdStyle}>{reconciled.diagnostics.ksStatistic.toFixed(3)}</td></tr>
            </tbody>
          </table>
        </section>
      )}

      <p className="t-body" style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
        {reconciled.detail}
      </p>
    </>
  );
}

const containerStyle: React.CSSProperties = {
  maxWidth: 820,
  margin: '0 auto',
  padding: 'var(--space-7) var(--space-5)',
  fontFamily: 'var(--font-sans)',
  color: 'var(--text-primary)',
};

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--border-subtle)',
  borderRadius: 4,
  padding: 'var(--space-5)',
  margin: 'var(--space-4) 0',
  background: 'var(--surface-1)',
};

const tableStyle: React.CSSProperties = {
  borderCollapse: 'collapse',
  width: '100%',
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
};
const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 8px',
  borderBottom: '1px solid var(--border-subtle)',
  width: '50%',
  color: 'var(--text-tertiary)',
  fontWeight: 500,
};
const tdStyle: React.CSSProperties = {
  textAlign: 'right',
  padding: '8px 8px',
  borderBottom: '1px solid var(--border-subtle)',
  fontVariantNumeric: 'tabular-nums',
};
