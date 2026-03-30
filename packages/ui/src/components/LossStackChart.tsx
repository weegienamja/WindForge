import type { ReactNode } from 'react';
import React from 'react';
import type { LossStack } from '@jamieblair/wind-site-intelligence-core';
import type { WindSiteTheme } from '../styles/theme.js';

export interface LossStackChartProps {
  losses: LossStack;
  className?: string;
  theme?: Partial<WindSiteTheme>;
}

const LOSS_COLORS = [
  '#ef4444', // wake
  '#f97316', // electrical
  '#f59e0b', // availability
  '#84cc16', // environmental
  '#06b6d4', // icing
  '#8b5cf6', // hysteresis
  '#ec4899', // curtailment
];

export function LossStackChart({ losses, className }: LossStackChartProps): ReactNode {
  const chartWidth = 400;
  const chartHeight = 28;
  const totalLoss = losses.totalLossPct;

  // Build segments
  let x = 0;
  const segments = losses.items.map((item, i) => {
    const width = (item.percent / Math.max(totalLoss, 1)) * chartWidth;
    const segment = { x, width, color: LOSS_COLORS[i % LOSS_COLORS.length]!, item };
    x += width;
    return segment;
  });

  return React.createElement(
    'div',
    {
      className,
      style: {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        border: '1px solid var(--wsi-border, #e2e8f0)',
        borderRadius: '8px',
        padding: '16px',
        backgroundColor: 'var(--wsi-surface, #f8fafc)',
      },
      role: 'figure',
      'aria-label': 'Loss stack breakdown chart',
    },
    React.createElement('h4', { style: { margin: '0 0 12px', fontSize: '14px', fontWeight: 600 } }, 'Loss Breakdown'),

    // Stacked bar
    React.createElement(
      'svg',
      {
        viewBox: `0 0 ${chartWidth} ${chartHeight}`,
        width: '100%',
        height: chartHeight,
        style: { display: 'block', marginBottom: '12px' },
      },
      ...segments.map((seg, i) =>
        React.createElement('rect', {
          key: i,
          x: seg.x,
          y: 0,
          width: Math.max(seg.width, 1),
          height: chartHeight,
          fill: seg.color,
          rx: i === 0 ? 4 : 0,
          ry: i === 0 ? 4 : 0,
        }),
      ),
    ),

    // Total
    React.createElement(
      'div',
      { style: { fontSize: '14px', fontWeight: 700, marginBottom: '12px' } },
      `Total: ${totalLoss.toFixed(1)}%`,
    ),

    // Legend
    React.createElement(
      'div',
      { style: { display: 'flex', flexWrap: 'wrap', gap: '8px 16px' } },
      ...losses.items.map((item, i) =>
        React.createElement(
          'div',
          {
            key: i,
            style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' },
          },
          React.createElement('div', {
            style: {
              width: '10px',
              height: '10px',
              borderRadius: '2px',
              backgroundColor: LOSS_COLORS[i % LOSS_COLORS.length],
            },
          }),
          React.createElement('span', null, `${item.name}: ${item.percent.toFixed(1)}%`),
        ),
      ),
    ),
  );
}
