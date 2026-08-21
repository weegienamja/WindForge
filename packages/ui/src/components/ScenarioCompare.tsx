import type { ReactNode } from 'react';
import React from 'react';
import type { SiteAnalysis, FactorScore } from '@jamieblair/windforge-core';
import type { MonthlyWindHistory } from '@jamieblair/windforge-core';
import type { WindSiteTheme } from '../styles/theme.js';

export interface ScenarioCompareProps {
  sites: SiteAnalysis[];
  className?: string;
  theme?: Partial<WindSiteTheme>;
  /** Optional monthly wind histories (one per site) for an overlaid trend comparison chart. */
  histories?: MonthlyWindHistory[];
}

const FACTOR_LABELS: Record<string, string> = {
  windResource: 'Wind Resource',
  terrainSuitability: 'Terrain Suitability',
  gridProximity: 'Grid Proximity',
  landUseCompatibility: 'Land Use',
  planningFeasibility: 'Planning Feasibility',
  accessLogistics: 'Access Logistics',
};

const SITE_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b'];

function getScoreColor(score: number): string {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#84cc16';
  if (score >= 40) return '#f59e0b';
  if (score >= 20) return '#f97316';
  return '#ef4444';
}

function siteLabel(analysis: SiteAnalysis, index: number): string {
  return `Site ${index + 1} (${analysis.coordinate.lat.toFixed(2)}, ${analysis.coordinate.lng.toFixed(2)})`;
}

export function ScenarioCompare({
  sites,
  className,
  theme: _theme,
  histories,
}: ScenarioCompareProps): ReactNode {
  if (sites.length < 2) {
    return React.createElement(
      'div',
      {
        className,
        style: { padding: 24, textAlign: 'center' as const, color: '#888' },
      },
      'Analyse at least 2 sites to compare.',
    );
  }

  const capped = sites.slice(0, 4);

  // Find the best score per factor
  const allFactorNames = capped[0]?.factors.map((f) => f.factor) ?? [];
  const factorBest: Record<string, number> = {};
  for (const name of allFactorNames) {
    let best = -1;
    for (const site of capped) {
      const f = site.factors.find((fac) => fac.factor === name);
      if (f && f.score > best) best = f.score;
    }
    factorBest[name] = best;
  }

  const eligibleScores = capped.flatMap((s) =>
    s.compositeScore === null ? [] : [s.compositeScore],
  );
  const compositeBest = eligibleScores.length > 0 ? Math.max(...eligibleScores) : null;

  return React.createElement(
    'div',
    {
      className,
      style: {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        border: '1px solid var(--wsi-border, #e2e8f0)',
        borderRadius: 8,
        padding: 24,
        backgroundColor: 'var(--wsi-surface, #f8fafc)',
        color: 'var(--wsi-text, #0f172a)',
        overflowX: 'auto' as const,
      },
      role: 'region',
      'aria-label': 'Site comparison',
    },
    React.createElement('h2', { style: { margin: '0 0 16px', fontSize: 20 } }, 'Site Comparison'),
    // Header row with composite scores
    React.createElement(
      'div',
      {
        style: {
          display: 'grid',
          gridTemplateColumns: `160px repeat(${capped.length}, 1fr)`,
          gap: 12,
          marginBottom: 20,
        },
      },
      React.createElement('div', null), // empty top-left cell
      ...capped.map((site, i) =>
        React.createElement(
          'div',
          {
            key: `header-${i}`,
            style: { textAlign: 'center' as const },
          },
          React.createElement(
            'div',
            {
              style: {
                width: 64,
                height: 64,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor:
                  site.compositeScore !== null && site.compositeScore === compositeBest
                    ? getScoreColor(site.compositeScore)
                    : '#94a3b8',
                color: '#fff',
                fontSize: 22,
                fontWeight: 'bold',
                margin: '0 auto 8px',
                border:
                  site.compositeScore !== null && site.compositeScore === compositeBest
                    ? '3px solid #fbbf24'
                    : '3px solid transparent',
              },
              'aria-label': `${siteLabel(site, i)} composite score: ${site.compositeScore}`,
            },
            site.compositeScore === null ? '—' : String(site.compositeScore),
          ),
          React.createElement(
            'div',
            { style: { fontSize: 13, fontWeight: 600, color: SITE_COLORS[i] } },
            siteLabel(site, i),
          ),
          site.compositeScore !== null &&
            site.compositeScore === compositeBest &&
            React.createElement(
              'div',
              { style: { fontSize: 11, color: '#22c55e', fontWeight: 600, marginTop: 2 } },
              'Best overall',
            ),
        ),
      ),
    ),
    // Factor rows
    ...allFactorNames.map((factorName) =>
      React.createElement(FactorComparisonRow, {
        key: factorName,
        factorName,
        sites: capped,
        bestScore: factorBest[factorName] ?? 0,
      }),
    ),
    // Wind trend overlay
    histories &&
      histories.length >= 2 &&
      React.createElement(
        'div',
        {
          style: {
            marginTop: 20,
            padding: 12,
            borderRadius: 6,
            border: '1px solid var(--wsi-border, #e2e8f0)',
          },
          role: 'img',
          'aria-label': 'Overlaid wind speed history for compared sites',
        },
        React.createElement(
          'h3',
          { style: { margin: '0 0 8px', fontSize: 14 } },
          'Wind Speed Trend Comparison',
        ),
        React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              flexWrap: 'wrap' as const,
              gap: 12,
              fontSize: 12,
              marginBottom: 8,
            },
          },
          ...histories.slice(0, 4).map((h, i) =>
            React.createElement(
              'span',
              { key: `legend-${i}`, style: { display: 'flex', alignItems: 'center', gap: 4 } },
              React.createElement('span', {
                style: {
                  width: 12,
                  height: 3,
                  backgroundColor: SITE_COLORS[i],
                  display: 'inline-block',
                  borderRadius: 2,
                },
              }),
              `Site ${i + 1} (${h.coordinate.lat.toFixed(2)}, ${h.coordinate.lng.toFixed(2)})`,
            ),
          ),
        ),
        React.createElement(OverlaidTrendSvg, { histories: histories.slice(0, 4) }),
      ),
    // Configured screening exclusions (legacy schema field: hardConstraints)
    capped.some((s) => s.hardConstraints.length > 0) &&
      React.createElement(
        'div',
        {
          style: {
            marginTop: 16,
            padding: 12,
            borderRadius: 6,
            backgroundColor: 'var(--wsi-error, #ef4444)',
            color: '#fff',
            fontSize: 13,
          },
          role: 'alert',
        },
        React.createElement('strong', null, 'Potential Screening Exclusions'),
        React.createElement(
          'ul',
          { style: { margin: '8px 0 0', paddingLeft: 20 } },
          ...capped.flatMap((site, i) =>
            site.hardConstraints.map((c, ci) =>
              React.createElement(
                'li',
                { key: `hc-${i}-${ci}` },
                `${siteLabel(site, i)}: ${c.description}`,
              ),
            ),
          ),
        ),
      ),
  );
}

function FactorComparisonRow({
  factorName,
  sites,
  bestScore,
}: {
  factorName: string;
  sites: SiteAnalysis[];
  bestScore: number;
}): ReactNode {
  return React.createElement(
    'div',
    {
      style: {
        display: 'grid',
        gridTemplateColumns: `160px repeat(${sites.length}, 1fr)`,
        gap: 12,
        padding: '10px 0',
        borderBottom: '1px solid var(--wsi-border, #e2e8f0)',
        alignItems: 'center',
      },
    },
    React.createElement(
      'div',
      { style: { fontSize: 13, fontWeight: 600 } },
      FACTOR_LABELS[factorName] ?? factorName,
    ),
    ...sites.map((site, i) => {
      const factor: FactorScore | undefined = site.factors.find((f) => f.factor === factorName);
      if (!factor) {
        return React.createElement(
          'div',
          { key: `f-${i}`, style: { fontSize: 12, color: '#999' } },
          'N/A',
        );
      }
      const isBest = factor.score === bestScore && sites.length > 1;

      return React.createElement(
        'div',
        { key: `f-${i}` },
        React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 4,
            },
          },
          React.createElement(
            'span',
            {
              style: {
                fontWeight: 600,
                fontSize: 14,
                color: isBest ? '#22c55e' : 'inherit',
              },
            },
            `${factor.score}/100`,
          ),
          isBest &&
            React.createElement(
              'span',
              { style: { fontSize: 10, color: '#22c55e', fontWeight: 600 } },
              'Best',
            ),
        ),
        // Score bar
        React.createElement(
          'div',
          {
            style: {
              height: 6,
              backgroundColor: '#e2e8f0',
              borderRadius: 3,
              overflow: 'hidden',
            },
          },
          React.createElement('div', {
            style: {
              height: '100%',
              width: `${factor.score}%`,
              backgroundColor: SITE_COLORS[i],
              borderRadius: 3,
            },
          }),
        ),
        React.createElement(
          'div',
          { style: { fontSize: 11, color: '#64748b', marginTop: 2 } },
          `${(factor.weight * 100).toFixed(0)}% weight, ${factor.confidence} confidence`,
        ),
      );
    }),
  );
}

/** Simple SVG sparkline overlay showing annual average wind speeds for each site. */
function OverlaidTrendSvg({ histories }: { histories: MonthlyWindHistory[] }): ReactNode {
  const width = 400;
  const height = 120;
  const pad = { top: 10, right: 10, bottom: 20, left: 35 };

  // Build annual averages per site
  const siteAnnuals = histories.map((h) => {
    const byYear = new Map<number, number[]>();
    for (const r of h.records) {
      const speed = r.ws50m ?? r.ws10m ?? r.ws2m;
      if (speed === null) continue;
      const arr = byYear.get(r.year) ?? [];
      arr.push(speed);
      byYear.set(r.year, arr);
    }
    return [...byYear.entries()]
      .map(([year, speeds]) => ({ year, avg: speeds.reduce((a, b) => a + b, 0) / speeds.length }))
      .sort((a, b) => a.year - b.year);
  });

  const allYears = siteAnnuals.flatMap((s) => s.map((d) => d.year));
  const allSpeeds = siteAnnuals.flatMap((s) => s.map((d) => d.avg));
  if (allYears.length === 0) return null;

  const minYear = Math.min(...allYears);
  const maxYear = Math.max(...allYears);
  const minSpeed = Math.min(...allSpeeds) * 0.9;
  const maxSpeed = Math.max(...allSpeeds) * 1.1;

  const xScale = (year: number) =>
    pad.left + ((year - minYear) / Math.max(maxYear - minYear, 1)) * (width - pad.left - pad.right);
  const yScale = (speed: number) =>
    pad.top +
    (1 - (speed - minSpeed) / Math.max(maxSpeed - minSpeed, 0.1)) * (height - pad.top - pad.bottom);

  return React.createElement(
    'svg',
    { width: '100%', viewBox: `0 0 ${width} ${height}`, style: { display: 'block' } },
    // Y axis labels
    React.createElement(
      'text',
      { x: 2, y: pad.top + 4, fontSize: 9, fill: '#64748b' },
      `${maxSpeed.toFixed(1)}`,
    ),
    React.createElement(
      'text',
      { x: 2, y: height - pad.bottom, fontSize: 9, fill: '#64748b' },
      `${minSpeed.toFixed(1)}`,
    ),
    // X axis labels
    React.createElement(
      'text',
      { x: pad.left, y: height - 4, fontSize: 9, fill: '#64748b', textAnchor: 'start' },
      String(minYear),
    ),
    React.createElement(
      'text',
      { x: width - pad.right, y: height - 4, fontSize: 9, fill: '#64748b', textAnchor: 'end' },
      String(maxYear),
    ),
    // Lines
    ...siteAnnuals.map((annuals, i) => {
      const points = annuals.map((d) => `${xScale(d.year)},${yScale(d.avg)}`).join(' ');
      return React.createElement('polyline', {
        key: `line-${i}`,
        points,
        fill: 'none',
        stroke: SITE_COLORS[i],
        strokeWidth: 2,
        strokeLinejoin: 'round',
      });
    }),
  );
}
