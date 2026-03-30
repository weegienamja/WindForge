import type { ReactNode } from 'react';
import React from 'react';
import type { SiteConstraintReport } from '@jamieblair/wind-site-intelligence-core';
import type { WindSiteTheme } from '../styles/theme.js';

export interface ConstraintMapProps {
  /** SVG-based map of constraint locations relative to site boundary */
  boundaryPolygon: Array<{ lat: number; lng: number }>;
  report: SiteConstraintReport;
  width?: number;
  height?: number;
  className?: string;
  theme?: Partial<WindSiteTheme>;
}

const SEVERITY_COLORS: Record<string, string> = {
  hard: '#dc2626',
  soft: '#f59e0b',
  info: '#3b82f6',
};

export function ConstraintMap({
  boundaryPolygon,
  report,
  width = 500,
  height = 400,
  className,
}: ConstraintMapProps): ReactNode {
  if (boundaryPolygon.length < 3) {
    return React.createElement('div', { className }, 'No boundary defined');
  }

  // Compute bounding box from boundary polygon only (not constraints)
  let bMinLat = 90, bMaxLat = -90, bMinLng = 180, bMaxLng = -180;
  for (const p of boundaryPolygon) {
    if (p.lat < bMinLat) bMinLat = p.lat;
    if (p.lat > bMaxLat) bMaxLat = p.lat;
    if (p.lng < bMinLng) bMinLng = p.lng;
    if (p.lng > bMaxLng) bMaxLng = p.lng;
  }

  // Expand boundary bbox by a generous margin to show nearby constraints
  const bLatRange = bMaxLat - bMinLat || 0.01;
  const bLngRange = bMaxLng - bMinLng || 0.01;
  const expandFactor = 0.6;
  const minLat = bMinLat - bLatRange * expandFactor;
  const maxLat = bMaxLat + bLatRange * expandFactor;
  const minLng = bMinLng - bLngRange * expandFactor;
  const maxLng = bMaxLng + bLngRange * expandFactor;

  // Cosine correction for latitude distortion - makes the map look geographically correct
  const midLat = (minLat + maxLat) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180);

  // Calculate aspect-ratio-correct dimensions
  const geoWidth = (maxLng - minLng) * cosLat;
  const geoHeight = maxLat - minLat;
  const geoAspect = geoWidth / geoHeight;

  let svgW = width;
  let svgH = height;
  if (geoAspect > width / height) {
    svgH = width / geoAspect;
  } else {
    svgW = height * geoAspect;
  }

  const toX = (lng: number) => ((lng - minLng) * cosLat / geoWidth) * svgW;
  const toY = (lat: number) => svgH - ((lat - minLat) / geoHeight) * svgH;

  // Boundary polygon path
  const boundaryPath = boundaryPolygon
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.lng).toFixed(1)},${toY(p.lat).toFixed(1)}`)
    .join(' ') + ' Z';

  // Filter constraints to those visible in the viewport, and deduplicate nearby ones
  const allConstraints = [...report.hardConstraints, ...report.softConstraints, ...report.infoConstraints];
  const visibleConstraints = allConstraints.filter(
    (c) => c.location.lat >= minLat && c.location.lat <= maxLat && c.location.lng >= minLng && c.location.lng <= maxLng,
  );

  // Cluster constraints that are very close together in SVG space
  const clustered: Array<{ x: number; y: number; severity: string; count: number; label: string }> = [];
  const clusterRadius = 12;
  for (const c of visibleConstraints) {
    const x = toX(c.location.lng);
    const y = toY(c.location.lat);
    const severity = c.definition.severity;
    const existing = clustered.find(
      (cl) => Math.abs(cl.x - x) < clusterRadius && Math.abs(cl.y - y) < clusterRadius && cl.severity === severity,
    );
    if (existing) {
      existing.count++;
      existing.x = (existing.x + x) / 2;
      existing.y = (existing.y + y) / 2;
    } else {
      clustered.push({ x, y, severity, count: 1, label: c.definition.name });
    }
  }

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
      'aria-label': 'Constraint map showing site boundary and constraint locations',
    },
    React.createElement('h4', { style: { margin: '0 0 12px', fontSize: '14px', fontWeight: 600 } }, 'Constraint Map'),
    React.createElement(
      'svg',
      {
        viewBox: `0 0 ${svgW.toFixed(0)} ${svgH.toFixed(0)}`,
        width: '100%',
        height: 'auto',
        style: { display: 'block', maxHeight: `${height}px` },
      },
      // Background
      React.createElement('rect', {
        x: 0, y: 0, width: svgW, height: svgH,
        fill: '#f8fafc',
        rx: 4,
      }),
      // Exclusion zones (only those visible in viewport)
      ...report.exclusionZones
        .filter((zone) => zone.polygon.some((p) => p.lat >= minLat && p.lat <= maxLat && p.lng >= minLng && p.lng <= maxLng))
        .map((zone, i) => {
          if (zone.polygon.length < 3) return null;
          const path = zone.polygon
            .map((p, j) => `${j === 0 ? 'M' : 'L'}${toX(p.lng).toFixed(1)},${toY(p.lat).toFixed(1)}`)
            .join(' ') + ' Z';
          return React.createElement('path', {
            key: `ez-${i}`,
            d: path,
            fill: '#dc2626',
            fillOpacity: 0.1,
            stroke: '#dc2626',
            strokeWidth: 1,
            strokeDasharray: '4,3',
          });
        }),
      // Boundary polygon
      React.createElement('path', {
        d: boundaryPath,
        fill: '#2563eb',
        fillOpacity: 0.12,
        stroke: '#2563eb',
        strokeWidth: 2.5,
        strokeLinejoin: 'round',
      }),
      // Clustered constraint markers
      ...clustered.map((c, i) => {
        const r = c.count > 1 ? Math.min(6 + Math.log2(c.count) * 3, 14) : 5;
        return React.createElement(
          'g',
          { key: `c-${i}` },
          React.createElement('circle', {
            cx: c.x.toFixed(1),
            cy: c.y.toFixed(1),
            r,
            fill: SEVERITY_COLORS[c.severity] ?? '#6b7280',
            stroke: '#fff',
            strokeWidth: 1.5,
            opacity: 0.85,
          }),
          c.count > 1
            ? React.createElement(
                'text',
                {
                  x: c.x.toFixed(1),
                  y: (c.y + 1).toFixed(1),
                  textAnchor: 'middle',
                  dominantBaseline: 'middle',
                  fontSize: '9',
                  fontWeight: '700',
                  fill: '#fff',
                  style: { pointerEvents: 'none' },
                },
                c.count.toString(),
              )
            : null,
        );
      }),
    ),
    // Legend
    React.createElement(
      'div',
      { style: { display: 'flex', gap: '16px', marginTop: '8px', fontSize: '12px', flexWrap: 'wrap' } },
      React.createElement(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
        React.createElement('div', { style: { width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#dc2626' } }),
        React.createElement('span', null, 'Hard'),
      ),
      React.createElement(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
        React.createElement('div', { style: { width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#f59e0b' } }),
        React.createElement('span', null, 'Soft'),
      ),
      React.createElement(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
        React.createElement('div', { style: { width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#3b82f6' } }),
        React.createElement('span', null, 'Info'),
      ),
      React.createElement(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
        React.createElement('div', { style: { width: '18px', height: '10px', backgroundColor: '#2563eb', opacity: 0.2, border: '1px solid #2563eb', borderRadius: '2px' } }),
        React.createElement('span', null, 'Site boundary'),
      ),
      React.createElement(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
        React.createElement('div', { style: { width: '18px', height: '10px', backgroundColor: '#dc2626', opacity: 0.15, border: '1px dashed #dc2626', borderRadius: '2px' } }),
        React.createElement('span', null, 'Exclusion zone'),
      ),
      visibleConstraints.length < allConstraints.length
        ? React.createElement(
            'div',
            { style: { fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' } },
            `Showing ${visibleConstraints.length} of ${allConstraints.length} constraints`,
          )
        : null,
    ),
  );
}
