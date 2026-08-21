import type { ReactNode } from 'react';
import React, { useCallback } from 'react';
import type { ScoringWeights } from '@jamieblair/windforge-core';
import type { WindSiteTheme } from '../styles/theme.js';

export interface WeightSlidersProps {
  weights: ScoringWeights;
  onChange: (weights: ScoringWeights) => void;
  className?: string;
  theme?: Partial<WindSiteTheme>;
}

const FACTOR_LABELS: Record<keyof ScoringWeights, string> = {
  windResource: 'Wind Resource',
  terrainSuitability: 'Terrain Suitability',
  gridProximity: 'Grid Proximity',
  landUseCompatibility: 'Land Use Compatibility',
  planningFeasibility: 'Planning Feasibility',
  accessLogistics: 'Access Logistics',
};

export function WeightSliders({
  weights,
  onChange,
  className,
  theme: _theme,
}: WeightSlidersProps): ReactNode {
  const handleChange = useCallback(
    (factor: keyof ScoringWeights, rawValue: number) => {
      const updated = { ...weights, [factor]: rawValue / 100 };
      onChange(updated);
    },
    [weights, onChange],
  );

  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
  const isBalanced = Math.abs(total - 1.0) < 0.01;

  return React.createElement(
    'div',
    {
      className,
      style: {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        border: '1px solid var(--wsi-border, #e2e8f0)',
        borderRadius: '8px',
        padding: '20px',
        backgroundColor: 'var(--wsi-surface, #f8fafc)',
      },
      role: 'group',
      'aria-label': 'Scoring weight adjustments',
    },
    React.createElement(
      'h3',
      { style: { margin: '0 0 16px', fontSize: '16px', color: 'var(--wsi-text, #0f172a)' } },
      'Scoring Weights',
    ),
    ...(Object.keys(FACTOR_LABELS) as Array<keyof ScoringWeights>).map((factor) =>
      React.createElement(
        'div',
        { key: factor, style: { marginBottom: '12px' } },
        React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '4px',
              fontSize: '14px',
            },
          },
          React.createElement('label', { htmlFor: `wsi-weight-${factor}` }, FACTOR_LABELS[factor]),
          React.createElement(
            'span',
            { style: { color: 'var(--wsi-text-secondary, #64748b)' } },
            `${(weights[factor] * 100).toFixed(0)}%`,
          ),
        ),
        React.createElement('input', {
          id: `wsi-weight-${factor}`,
          type: 'range',
          min: 0,
          max: 100,
          value: Math.round(weights[factor] * 100),
          onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
            handleChange(factor, Number(e.target.value)),
          style: { width: '100%', accentColor: 'var(--wsi-accent, #22c55e)' },
          'aria-label': `${FACTOR_LABELS[factor]} weight: ${(weights[factor] * 100).toFixed(0)}%`,
        }),
      ),
    ),
    !isBalanced &&
      React.createElement(
        'p',
        {
          style: {
            marginTop: '8px',
            fontSize: '12px',
            color: 'var(--wsi-warning, #f59e0b)',
          },
          role: 'status',
        },
        `Weights sum to ${(total * 100).toFixed(0)}%. They will be normalised automatically.`,
      ),
  );
}
