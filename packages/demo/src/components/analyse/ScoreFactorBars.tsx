'use client';

import type { FactorScore } from '@jamieblair/windforge-core';

const FACTOR_LABELS: Record<string, string> = {
  windResource: 'Wind resource',
  terrainSuitability: 'Terrain',
  gridProximity: 'Grid proximity',
  landUseCompatibility: 'Land use',
  planningFeasibility: 'Planning',
  accessLogistics: 'Access',
};

export type ScoreFactorBarsProps = {
  factors: ReadonlyArray<FactorScore>;
};

/**
 * Six horizontal bars, one per factor. `--accent-cool` for normal scores,
 * `--accent-warm` for hard-constraint factors (< 20).
 */
export function ScoreFactorBars({ factors }: ScoreFactorBarsProps) {
  return (
    <ul
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      {factors.map((f) => {
        const hard = f.score < 20;
        const colour = hard ? 'var(--accent-warm)' : 'var(--accent-cool)';
        const pct = Math.max(0, Math.min(100, f.score));
        return (
          <li key={f.factor} data-factor={f.factor}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 4,
              }}
            >
              <span className="t-caption" style={{ color: 'var(--text-secondary)' }}>
                {FACTOR_LABELS[f.factor] ?? f.factor}
              </span>
              <span
                className="t-mono-data"
                style={{ color: hard ? 'var(--accent-warm)' : 'var(--text-primary)' }}
              >
                {pct.toFixed(0)}
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={Math.round(pct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${FACTOR_LABELS[f.factor] ?? f.factor} score`}
              style={{
                width: '100%',
                height: 6,
                background: 'var(--surface-elevated)',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: colour,
                  transition: 'width var(--duration-medium) var(--easing-standard)',
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
