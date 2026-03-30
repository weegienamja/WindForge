import type { ReactNode } from 'react';
import React from 'react';
import type { SiteConstraintReport, DetectedConstraint, NearestReceptorTable } from '@jamieblair/wind-site-intelligence-core';
import type { WindSiteTheme } from '../styles/theme.js';

export interface ConstraintPanelProps {
  report: SiteConstraintReport;
  className?: string;
  theme?: Partial<WindSiteTheme>;
}

const SEVERITY_COLORS: Record<string, string> = {
  hard: '#dc2626',
  soft: '#f59e0b',
  info: '#3b82f6',
};

const RECOMMENDATION_COLORS: Record<string, string> = {
  proceed: '#16a34a',
  proceed_with_caution: '#f59e0b',
  significant_concerns: '#ea580c',
  likely_unviable: '#dc2626',
};

const RECOMMENDATION_LABELS: Record<string, string> = {
  proceed: 'Proceed',
  proceed_with_caution: 'Proceed with Caution',
  significant_concerns: 'Significant Concerns',
  likely_unviable: 'Likely Unviable',
};

export function ConstraintPanel({ report, className }: ConstraintPanelProps): ReactNode {
  const { summary } = report;
  const recColor = RECOMMENDATION_COLORS[summary.recommendation] ?? '#6b7280';
  const recLabel = RECOMMENDATION_LABELS[summary.recommendation] ?? summary.recommendation;

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
      role: 'region',
      'aria-label': 'Constraint analysis results',
    },
    // Header
    React.createElement('h3', { style: { margin: '0 0 16px', fontSize: '16px', fontWeight: 600 } }, 'Constraint Analysis'),

    // Recommendation badge
    React.createElement(
      'div',
      {
        style: {
          display: 'inline-block',
          padding: '6px 14px',
          borderRadius: '20px',
          backgroundColor: recColor,
          color: '#fff',
          fontWeight: 600,
          fontSize: '14px',
          marginBottom: '12px',
        },
      },
      recLabel,
    ),

    // Summary counts
    React.createElement(
      'div',
      { style: { display: 'flex', gap: '16px', marginBottom: '16px', fontSize: '13px' } },
      renderCount('Hard', summary.totalHard, SEVERITY_COLORS.hard!),
      renderCount('Soft', summary.totalSoft, SEVERITY_COLORS.soft!),
      renderCount('Info', summary.totalInfo, SEVERITY_COLORS.info!),
    ),

    // Reasoning
    React.createElement('p', { style: { fontSize: '13px', lineHeight: 1.5, margin: '0 0 16px', color: '#475569' } }, summary.reasoning),

    // Viable area
    React.createElement(
      'div',
      { style: { fontSize: '13px', marginBottom: '16px', padding: '8px 12px', backgroundColor: '#f1f5f9', borderRadius: '6px' } },
      `Viable area: ${summary.viableAreaPercent.toFixed(0)}%`,
    ),

    // Constraint lists
    report.hardConstraints.length > 0
      ? renderConstraintGroup('Hard Constraints', report.hardConstraints, 'hard')
      : null,
    report.softConstraints.length > 0
      ? renderConstraintGroup('Soft Constraints', report.softConstraints, 'soft')
      : null,
    report.infoConstraints.length > 0
      ? renderConstraintGroup('Information', report.infoConstraints, 'info')
      : null,

    // Nearest receptors table
    renderReceptorTable(report.nearestReceptors),
  );
}

function renderCount(label: string, count: number, color: string): ReactNode {
  return React.createElement(
    'div',
    { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
    React.createElement('div', {
      style: { width: '10px', height: '10px', borderRadius: '50%', backgroundColor: color },
    }),
    React.createElement('span', null, `${count} ${label}`),
  );
}

function renderConstraintGroup(title: string, constraints: DetectedConstraint[], severity: string): ReactNode {
  const color = SEVERITY_COLORS[severity] ?? '#6b7280';

  return React.createElement(
    'div',
    { style: { marginBottom: '16px' } },
    React.createElement(
      'h4',
      { style: { fontSize: '14px', fontWeight: 600, margin: '0 0 8px', color } },
      `${title} (${constraints.length})`,
    ),
    ...constraints.map((c, i) =>
      React.createElement(
        'div',
        {
          key: i,
          style: {
            padding: '8px 12px',
            marginBottom: '4px',
            borderLeft: `3px solid ${color}`,
            backgroundColor: '#fff',
            borderRadius: '0 4px 4px 0',
            fontSize: '13px',
          },
        },
        React.createElement('div', { style: { fontWeight: 500 } }, c.definition.name),
        React.createElement('div', { style: { color: '#64748b', marginTop: '2px' } }, c.detail),
        React.createElement(
          'div',
          { style: { color: '#94a3b8', marginTop: '2px', fontSize: '12px' } },
          `${Math.round(c.distanceFromSiteM)}m from boundary`,
        ),
      ),
    ),
  );
}

function renderReceptorTable(receptors: NearestReceptorTable): ReactNode {
  const rows: Array<{ label: string; value: number | null }> = [
    { label: 'Nearest dwelling', value: receptors.nearestDwellingM },
    { label: 'Nearest settlement', value: receptors.nearestSettlementM },
    { label: 'Nearest protected area', value: receptors.nearestProtectedAreaM },
    { label: 'Nearest substation', value: receptors.nearestSubstationM },
    { label: 'Nearest major road', value: receptors.nearestMajorRoadM },
    { label: 'Nearest wind farm', value: receptors.nearestExistingWindFarmM },
    { label: 'Nearest waterbody', value: receptors.nearestWaterbodyM },
    { label: 'Nearest railway', value: receptors.nearestRailwayM },
  ];

  return React.createElement(
    'div',
    { style: { marginTop: '16px' } },
    React.createElement('h4', { style: { fontSize: '14px', fontWeight: 600, margin: '0 0 8px' } }, 'Nearest Receptors'),
    React.createElement(
      'table',
      {
        style: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
        role: 'table',
        'aria-label': 'Nearest receptor distances',
      },
      React.createElement(
        'tbody',
        null,
        ...rows.map((row, i) =>
          React.createElement(
            'tr',
            {
              key: i,
              style: { borderBottom: '1px solid #e2e8f0' },
            },
            React.createElement('td', { style: { padding: '6px 8px', color: '#475569' } }, row.label),
            React.createElement(
              'td',
              { style: { padding: '6px 8px', textAlign: 'right', fontWeight: 500 } },
              row.value !== null ? formatDistance(row.value) : 'N/A',
            ),
          ),
        ),
      ),
    ),
  );
}

function formatDistance(meters: number): string {
  if (meters === 0) return 'On site';
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}
