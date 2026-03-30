import type { ReactNode } from 'react';
import React from 'react';
import type { SiteAssessment } from '@jamieblair/wind-site-intelligence-core';
import type { WindSiteTheme } from '../styles/theme.js';
import { ConstraintPanel } from './ConstraintPanel.js';
import { ConstraintMap } from './ConstraintMap.js';
import { EnergyYieldCard } from './EnergyYieldCard.js';
import { LossStackChart } from './LossStackChart.js';

export interface SiteAssessmentViewProps {
  assessment: SiteAssessment;
  className?: string;
  theme?: Partial<WindSiteTheme>;
}

export function SiteAssessmentView({ assessment, className, theme }: SiteAssessmentViewProps): ReactNode {
  const { aggregatedScore, boundary, constraints, metadata } = assessment;
  const scoreColor = getScoreColor(aggregatedScore.compositeScore);

  return React.createElement(
    'div',
    {
      className,
      style: {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      },
      role: 'region',
      'aria-label': `Site assessment for ${boundary.name}`,
    },

    // Header with overall score
    React.createElement(
      'div',
      {
        style: {
          border: '1px solid var(--wsi-border, #e2e8f0)',
          borderRadius: '8px',
          padding: '20px',
          backgroundColor: 'var(--wsi-surface, #f8fafc)',
        },
      },
      React.createElement(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '16px' } },
        // Score circle
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
              flexShrink: 0,
            },
            'aria-label': `Composite score: ${aggregatedScore.compositeScore}`,
          },
          String(aggregatedScore.compositeScore),
        ),
        React.createElement(
          'div',
          null,
          React.createElement('h2', { style: { margin: '0 0 4px', fontSize: '20px' } }, boundary.name || 'Site Assessment'),
          React.createElement(
            'div',
            { style: { fontSize: '13px', color: '#64748b' } },
            `Area: ${boundary.areaSqKm.toFixed(2)} km\u00b2 | `,
            `Viable: ${aggregatedScore.viableAreaPercent.toFixed(0)}% (${aggregatedScore.viableAreaSqKm.toFixed(2)} km\u00b2) | `,
            `${aggregatedScore.sampleCount} sample points`,
          ),
        ),
      ),

      // Factor averages
      aggregatedScore.factorAverages.length > 0
        ? React.createElement(
            'div',
            { style: { display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap' } },
            ...aggregatedScore.factorAverages.map((factor) => {
              const fColor = getScoreColor(factor.score);
              return React.createElement(
                'div',
                {
                  key: factor.factor,
                  style: {
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: '#fff',
                    border: '1px solid #e2e8f0',
                    textAlign: 'center',
                    minWidth: '100px',
                  },
                },
                React.createElement(
                  'div',
                  { style: { fontSize: '11px', color: '#64748b', marginBottom: '4px' } },
                  factor.factor.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
                ),
                React.createElement(
                  'div',
                  { style: { fontSize: '18px', fontWeight: 700, color: fColor } },
                  String(factor.score),
                ),
              );
            }),
          )
        : null,
    ),

    // Two-column layout: constraints + map
    React.createElement(
      'div',
      { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' } },
      React.createElement(ConstraintPanel, { report: constraints, theme }),
      React.createElement(ConstraintMap, {
        boundaryPolygon: boundary.polygon,
        report: constraints,
        theme,
      }),
    ),

    // Energy yield (if available)
    assessment.energyYield
      ? React.createElement(
          'div',
          { style: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' } },
          React.createElement(EnergyYieldCard, { result: assessment.energyYield, theme }),
          React.createElement(LossStackChart, { losses: assessment.energyYield.losses, theme }),
        )
      : null,

    // Metadata
    React.createElement(
      'div',
      {
        style: {
          fontSize: '12px',
          color: '#94a3b8',
          padding: '12px 16px',
          backgroundColor: '#f8fafc',
          borderRadius: '6px',
          border: '1px solid #e2e8f0',
        },
      },
      `Analysed ${new Date(metadata.analysedAt).toLocaleString()} | `,
      `${metadata.durationMs}ms | `,
      `Grid spacing: ${metadata.sampleSpacingKm}km | `,
      `Hub height: ${metadata.hubHeightM}m | `,
      `Sources: ${metadata.sourcesUsed.join(', ')}`,
      metadata.sourcesFailed.length > 0
        ? ` | Failed: ${metadata.sourcesFailed.join(', ')}`
        : '',
    ),
  );
}

function getScoreColor(score: number): string {
  if (score >= 70) return '#16a34a';
  if (score >= 50) return '#f59e0b';
  if (score >= 30) return '#ea580c';
  return '#dc2626';
}
