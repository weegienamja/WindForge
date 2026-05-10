'use client';

import type { CSSProperties } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { EnergyYieldResult, TurbineModel } from '@jamieblair/windforge-core';
import { NumericReadout } from '../primitives/NumericReadout';

const AXIS_STYLE = {
  fill: 'var(--text-tertiary)',
  fontSize: 11,
  fontFamily: 'var(--font-mono)',
} as const;

interface TooltipRow {
  payload?: { windSpeedMs?: number; powerKw?: number };
}

function CurveTooltip({ active, payload }: { active?: boolean; payload?: TooltipRow[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border-subtle)',
        padding: '8px 10px',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--text-primary)',
      }}
    >
      <div style={{ color: 'var(--text-secondary)' }}>
        {point.windSpeedMs?.toFixed(1)} m/s
      </div>
      <div>{point.powerKw?.toFixed(0)} kW</div>
    </div>
  );
}

export interface PowerCurveChartProps {
  turbine: TurbineModel;
  aep: EnergyYieldResult;
  className?: string;
  style?: CSSProperties;
}

/**
 * Recharts line chart of the selected turbine's power curve, with three
 * P50/P75/P90 AEP readouts beneath. Drives the analyse-page yield
 * drilldown.
 */
export function PowerCurveChart({ turbine, aep, className, style }: PowerCurveChartProps) {
  const points = turbine.powerCurve;
  return (
    <div
      data-testid="power-curve-chart"
      className={className}
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 4,
        padding: 'var(--space-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        ...style,
      }}
    >
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
            <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="windSpeedMs"
              type="number"
              domain={[0, 'dataMax']}
              tick={AXIS_STYLE}
              stroke="var(--border-subtle)"
              label={{
                value: 'Wind speed (m/s)',
                position: 'insideBottom',
                offset: -8,
                style: { ...AXIS_STYLE, textAnchor: 'middle' },
              }}
            />
            <YAxis
              tick={AXIS_STYLE}
              stroke="var(--border-subtle)"
              label={{
                value: 'Power (kW)',
                angle: -90,
                position: 'insideLeft',
                style: { ...AXIS_STYLE, textAnchor: 'middle' },
              }}
            />
            <Tooltip content={<CurveTooltip />} />
            <Line
              type="monotone"
              dataKey="powerKw"
              stroke="var(--accent-cool)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul
        data-testid="aep-readouts"
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 'var(--space-3)',
        }}
      >
        <AepRow label="P50" mwh={aep.p50.aepMwh} confidence={aep.confidence} />
        <AepRow label="P75" mwh={aep.p75.aepMwh} confidence={aep.confidence} />
        <AepRow label="P90" mwh={aep.p90.aepMwh} confidence={aep.confidence} />
      </ul>
    </div>
  );
}

function AepRow({
  label,
  mwh,
  confidence,
}: {
  label: string;
  mwh: number;
  confidence: 'high' | 'medium' | 'low';
}) {
  return (
    <li>
      <div className="t-eyebrow" style={{ color: 'var(--text-tertiary)' }}>
        {label} AEP
      </div>
      <div style={{ marginTop: 4 }}>
        <NumericReadout value={mwh} unit="MWh/yr" precision={0} confidence={confidence} />
      </div>
    </li>
  );
}

export function PowerCurveEmpty({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      data-testid="power-curve-empty"
      className={className}
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 4,
        padding: 'var(--space-5)',
        color: 'var(--text-tertiary)',
        ...style,
      }}
    >
      <span className="t-mono-data" style={{ fontSize: 12 }}>
        Run an analysis to compute AEP for the selected turbine.
      </span>
    </div>
  );
}

export function PowerCurveSkeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      data-testid="power-curve-skeleton"
      className={className}
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 4,
        height: 320,
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      <style>{`@keyframes wf-curve-shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}`}</style>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, transparent, var(--surface-elevated), transparent)',
          animation: 'wf-curve-shimmer 1.4s ease-in-out infinite',
        }}
      />
    </div>
  );
}
