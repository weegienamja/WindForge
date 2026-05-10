'use client';

import type { CSSProperties } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MonthlyWindHistory } from '@jamieblair/windforge-core';
import { DataCard } from '../primitives/DataCard';

export interface MonthlyHistoryChartProps {
  raw: MonthlyWindHistory;
  corrected: MonthlyWindHistory | null;
  hubHeightM: number;
  reference?: 'cerra' | 'era5' | null;
  diagnostics?: {
    biasBeforeMs: number;
    biasAfterMs: number;
    rmseBeforeMs: number;
    rmseAfterMs: number;
  } | null;
  className?: string;
  style?: CSSProperties;
}

interface ChartRow {
  yearMonth: string;
  raw: number;
  corrected: number | null;
  delta: number | null;
}

const AXIS_STYLE = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  fill: 'var(--text-secondary)',
} as const;

function bestSpeed(record: { ws50m: number; ws10m: number; ws2m: number }): number {
  if (record.ws50m > 0) return record.ws50m;
  if (record.ws10m > 0) return record.ws10m;
  return record.ws2m;
}

function buildRows(
  raw: MonthlyWindHistory,
  corrected: MonthlyWindHistory | null,
): ChartRow[] {
  const correctedByKey = new Map<string, number>();
  if (corrected) {
    for (const r of corrected.records) {
      correctedByKey.set(`${r.year}-${r.month}`, bestSpeed(r));
    }
  }
  return raw.records.map((r) => {
    const key = `${r.year}-${r.month}`;
    const rawSpeed = bestSpeed(r);
    const correctedSpeed = correctedByKey.get(key) ?? null;
    return {
      yearMonth: `${r.year}-${String(r.month).padStart(2, '0')}`,
      raw: Number(rawSpeed.toFixed(2)),
      corrected: correctedSpeed === null ? null : Number(correctedSpeed.toFixed(2)),
      delta:
        correctedSpeed === null ? null : Number((correctedSpeed - rawSpeed).toFixed(2)),
    };
  });
}

function formatYearTick(value: string): string {
  return value.endsWith('-01') ? value.slice(0, 4) : '';
}

interface TooltipPayload {
  payload: ChartRow;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div
      style={{
        background: 'var(--surface-elevated)',
        border: '1px solid var(--border-strong)',
        borderRadius: 4,
        padding: '8px 12px',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        color: 'var(--text-primary)',
      }}
    >
      <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      <div>Raw: {row.raw.toFixed(2)} m/s</div>
      {row.corrected !== null && <div>Corrected: {row.corrected.toFixed(2)} m/s</div>}
      {row.delta !== null && (
        <div style={{ color: 'var(--text-tertiary)', marginTop: 2 }}>
          Δ {row.delta >= 0 ? '+' : ''}
          {row.delta.toFixed(2)} m/s
        </div>
      )}
    </div>
  );
}

export function MonthlyHistoryChart({
  raw,
  corrected,
  hubHeightM,
  reference = null,
  diagnostics = null,
  className,
  style,
}: MonthlyHistoryChartProps) {
  const rows = buildRows(raw, corrected);
  const hasCorrected = corrected !== null && rows.some((r) => r.corrected !== null);
  const correctedLabel = `Corrected (${(reference ?? 'cerra').toUpperCase()})`;

  return (
    <DataCard
      eyebrow="MONTHLY HISTORY"
      title={`${raw.startYear}–${raw.endYear} · ${hubHeightM}m hub`}
      className={className}
      style={style}
    >
      <div
        data-testid="monthly-history-chart"
        style={{ position: 'relative', width: '100%', height: 280 }}
      >
        {hasCorrected && diagnostics && (
          <div
            data-testid="monthly-history-stats"
            style={{
              position: 'absolute',
              top: 6,
              left: 12,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-secondary)',
              zIndex: 1,
              pointerEvents: 'none',
              maxWidth: '70%',
            }}
          >
            Bias reduced from {diagnostics.biasBeforeMs >= 0 ? '+' : ''}
            {diagnostics.biasBeforeMs.toFixed(2)} to {diagnostics.biasAfterMs >= 0 ? '+' : ''}
            {diagnostics.biasAfterMs.toFixed(2)} m/s · RMSE{' '}
            {diagnostics.rmseBeforeMs.toFixed(2)} → {diagnostics.rmseAfterMs.toFixed(2)} m/s
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 32, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid stroke="var(--border-subtle)" strokeOpacity={0.25} />
            <XAxis
              dataKey="yearMonth"
              tick={AXIS_STYLE}
              tickFormatter={formatYearTick}
              stroke="var(--border-strong)"
              interval={0}
            />
            <YAxis
              tick={AXIS_STYLE}
              stroke="var(--border-strong)"
              label={{
                value: 'Wind speed (m/s)',
                angle: -90,
                position: 'insideLeft',
                style: AXIS_STYLE,
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="top"
              align="right"
              height={24}
              wrapperStyle={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--text-secondary)',
              }}
            />
            {hasCorrected ? (
              <>
                <Line
                  name="NASA POWER (raw)"
                  type="monotone"
                  dataKey="raw"
                  stroke="var(--accent-cool-dim)"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  name={correctedLabel}
                  type="monotone"
                  dataKey="corrected"
                  stroke="var(--accent-cool)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              </>
            ) : (
              <Line
                name="NASA POWER"
                type="monotone"
                dataKey="raw"
                stroke="var(--accent-cool)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </DataCard>
  );
}

export interface MonthlyHistoryEmptyProps {
  className?: string;
  style?: CSSProperties;
}

export function MonthlyHistoryEmpty({ className, style }: MonthlyHistoryEmptyProps) {
  return (
    <DataCard eyebrow="MONTHLY HISTORY" className={className} style={style}>
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--text-secondary)',
          margin: 0,
        }}
      >
        Run an analysis to see monthly wind history.
      </p>
    </DataCard>
  );
}

export interface MonthlyHistorySkeletonProps {
  className?: string;
  style?: CSSProperties;
}

export function MonthlyHistorySkeleton({ className, style }: MonthlyHistorySkeletonProps) {
  return (
    <DataCard eyebrow="MONTHLY HISTORY" className={className} style={style}>
      <div
        data-testid="monthly-history-skeleton"
        aria-hidden="true"
        style={{
          width: '100%',
          height: 280,
          background:
            'linear-gradient(90deg, var(--surface-1) 0%, var(--surface-elevated) 50%, var(--surface-1) 100%)',
          backgroundSize: '200% 100%',
          animation: 'monthly-history-shimmer 1.6s linear infinite',
          borderRadius: 4,
        }}
      />
      <style>{`@keyframes monthly-history-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </DataCard>
  );
}
