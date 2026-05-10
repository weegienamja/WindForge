'use client';

import type { CSSProperties } from 'react';
import type { MonthlyWindHistory } from '@jamieblair/windforge-core';
import { WindRose, type WindSpeedBand } from '@jamieblair/windforge';
import { windRoseFromHistory } from './windRoseFromHistory';

/**
 * WindForge-themed speed bands for the wind rose. The default UI bands
 * use generic blues; these map onto the design tokens so the rose feels
 * native to the analyse page.
 */
const THEMED_BANDS: WindSpeedBand[] = [
  { minMs: 0, maxMs: 4, label: '0–4 m/s', color: 'rgba(96, 165, 250, 0.55)' },
  { minMs: 4, maxMs: 8, label: '4–8 m/s', color: 'rgba(56, 189, 248, 0.75)' },
  { minMs: 8, maxMs: 12, label: '8–12 m/s', color: 'rgba(34, 211, 238, 0.85)' },
  { minMs: 12, maxMs: Infinity, label: '12+ m/s', color: 'rgba(251, 191, 36, 0.95)' },
];

export interface WindRoseChartProps {
  history: MonthlyWindHistory;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Drilldown chart wrapper around the windforge-ui WindRose. Buckets
 * monthly history into 16-point compass directions and themed speed
 * bands, then renders the rose with site-tokenised colours.
 */
export function WindRoseChart({ history, size = 360, className, style }: WindRoseChartProps) {
  const data = windRoseFromHistory(history, THEMED_BANDS);
  const hasData = history.records.length > 0;
  if (!hasData) return <WindRoseEmpty className={className} style={style} />;
  return (
    <div
      data-testid="wind-rose-chart"
      className={className}
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 4,
        padding: 'var(--space-5)',
        display: 'flex',
        justifyContent: 'center',
        ...style,
      }}
    >
      <WindRose data={data} bands={THEMED_BANDS} size={size} />
    </div>
  );
}

export function WindRoseEmpty({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      data-testid="wind-rose-empty"
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
        No directional data available.
      </span>
    </div>
  );
}

export function WindRoseSkeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      data-testid="wind-rose-skeleton"
      className={className}
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 4,
        height: 360,
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      <style>{`@keyframes wf-rose-shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}`}</style>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, transparent, var(--surface-elevated), transparent)',
          animation: 'wf-rose-shimmer 1.4s ease-in-out infinite',
        }}
      />
    </div>
  );
}
