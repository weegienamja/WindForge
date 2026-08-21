import type { ReactNode } from 'react';
import React from 'react';
import type { SiteAnalysis, FactorScore, Constraint, Warning } from '@jamieblair/windforge-core';
import type { WindSiteTheme } from '../styles/theme.js';
import { WindRose, DEFAULT_WIND_BANDS } from './WindRose.js';
import type { WindRoseDirectionData, WindSpeedBand } from './WindRose.js';

export interface ScoreCardProps {
  analysis: SiteAnalysis;
  className?: string;
  theme?: Partial<WindSiteTheme>;
  /** Optional wind rose direction data to display below the wind resource factor. */
  windRoseData?: WindRoseDirectionData[];
  /** Speed bands for the wind rose. Defaults to DEFAULT_WIND_BANDS. */
  windRoseBands?: WindSpeedBand[];
}

export function ScoreCard({
  analysis,
  className,
  theme: _theme,
  windRoseData,
  windRoseBands,
}: ScoreCardProps): ReactNode {
  const scoreColor =
    analysis.compositeScore === null ? '#64748b' : getScoreColor(analysis.compositeScore);

  return React.createElement(
    'div',
    {
      className: className,
      style: {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        border: '1px solid var(--wsi-border, #e2e8f0)',
        borderRadius: '8px',
        padding: '24px',
        backgroundColor: 'var(--wsi-surface, #f8fafc)',
        color: 'var(--wsi-text, #0f172a)',
      },
      role: 'region',
      'aria-label': 'Site screening score breakdown',
    },
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' } },
      React.createElement(
        'div',
        {
          style: {
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: scoreColor,
            color: '#fff',
            fontSize: '28px',
            fontWeight: 'bold',
          },
          'aria-label':
            analysis.compositeScore === null
              ? 'Composite score unavailable'
              : `Composite score: ${analysis.compositeScore} out of 100`,
        },
        analysis.compositeScore === null ? '—' : String(analysis.compositeScore),
      ),
      React.createElement(
        'div',
        null,
        React.createElement(
          'h2',
          { style: { margin: 0, fontSize: '20px' } },
          analysis.compositeScore === null ? 'Incomplete screening' : 'Composite Screening Score',
        ),
        React.createElement(
          'p',
          {
            style: {
              margin: '4px 0 0',
              color: 'var(--wsi-text-secondary, #64748b)',
              fontSize: '14px',
            },
          },
          `${analysis.coordinate.lat.toFixed(4)}, ${analysis.coordinate.lng.toFixed(4)}`,
        ),
        analysis.compositeScore === null &&
          React.createElement(
            'p',
            {
              style: {
                margin: '4px 0 0',
                color: 'var(--wsi-text-secondary, #64748b)',
                fontSize: '12px',
              },
            },
            analysis.metadata.completeness.detail,
          ),
      ),
    ),
    analysis.hardConstraints.length > 0 &&
      React.createElement(
        'div',
        {
          role: 'alert',
          style: {
            padding: '12px',
            marginBottom: '16px',
            borderRadius: '6px',
            backgroundColor: 'var(--wsi-error, #ef4444)',
            color: '#fff',
            fontSize: '14px',
          },
        },
        React.createElement('strong', null, 'Potential Screening Exclusions'),
        React.createElement(
          'ul',
          { style: { margin: '8px 0 0', paddingLeft: '20px' } },
          ...analysis.hardConstraints.map((c: Constraint) =>
            React.createElement('li', { key: c.description }, c.description),
          ),
        ),
      ),
    analysis.warnings.length > 0 &&
      React.createElement(
        'div',
        {
          role: 'status',
          style: {
            padding: '12px',
            marginBottom: '16px',
            borderRadius: '6px',
            backgroundColor: 'var(--wsi-warning, #f59e0b)',
            color: '#fff',
            fontSize: '14px',
          },
        },
        React.createElement('strong', null, 'Warnings'),
        React.createElement(
          'ul',
          { style: { margin: '8px 0 0', paddingLeft: '20px' } },
          ...analysis.warnings.map((w: Warning) =>
            React.createElement('li', { key: w.description }, w.description),
          ),
        ),
      ),
    React.createElement(
      'div',
      { style: { display: 'flex', flexDirection: 'column' as const, gap: '12px' } },
      ...analysis.factors.map((factor: FactorScore) =>
        React.createElement(FactorRow, { key: factor.factor, factor }),
      ),
    ),
    windRoseData &&
      windRoseData.length > 0 &&
      React.createElement(
        'div',
        { style: { marginTop: '16px', display: 'flex', justifyContent: 'center' } },
        React.createElement(WindRose, {
          data: windRoseData,
          bands: windRoseBands ?? DEFAULT_WIND_BANDS,
          size: 300,
        }),
      ),
    React.createElement(
      'p',
      {
        style: {
          marginTop: '16px',
          fontSize: '12px',
          color: 'var(--wsi-text-secondary, #64748b)',
        },
      },
      `Analysed ${new Date(analysis.metadata.analysedAt).toLocaleString()} `,
      `(${analysis.metadata.durationMs}ms). Sources: ${analysis.metadata.sourcesUsed.join(', ') || 'N/A'}`,
    ),
  );
}

function FactorRow({ factor }: { factor: FactorScore }): ReactNode {
  const barColor = getScoreColor(factor.score);
  const label = formatFactorName(factor.factor);

  return React.createElement(
    'div',
    {
      style: { fontSize: '14px' },
      'aria-label': `${label}: ${factor.score} out of 100`,
    },
    React.createElement(
      'div',
      { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } },
      React.createElement('span', { style: { fontWeight: 500 } }, label),
      React.createElement(
        'span',
        { style: { color: 'var(--wsi-text-secondary, #64748b)' } },
        `${factor.score}/100 (weight: ${(factor.weight * 100).toFixed(0)}%)`,
      ),
    ),
    React.createElement(
      'div',
      {
        style: {
          height: '8px',
          backgroundColor: 'var(--wsi-border, #e2e8f0)',
          borderRadius: '4px',
          overflow: 'hidden',
        },
        role: 'progressbar',
        'aria-valuenow': factor.score,
        'aria-valuemin': 0,
        'aria-valuemax': 100,
      },
      React.createElement('div', {
        style: {
          height: '100%',
          width: `${factor.score}%`,
          backgroundColor: barColor,
          borderRadius: '4px',
          transition: 'width 0.3s ease',
        },
      }),
    ),
    React.createElement(
      'p',
      {
        style: {
          margin: '4px 0 0',
          fontSize: '12px',
          color: 'var(--wsi-text-secondary, #64748b)',
        },
      },
      factor.detail,
      ` (Confidence: ${factor.confidence})`,
    ),
  );
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'var(--wsi-success, #22c55e)';
  if (score >= 60) return '#84cc16';
  if (score >= 40) return 'var(--wsi-warning, #f59e0b)';
  if (score >= 20) return '#f97316';
  return 'var(--wsi-error, #ef4444)';
}

function formatFactorName(factor: string): string {
  return factor
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}
