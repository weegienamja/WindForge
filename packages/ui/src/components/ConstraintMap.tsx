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
  width = 400,
  height = 300,
  className,
}: ConstraintMapProps): ReactNode {
  if (boundaryPolygon.length < 3) {
    return React.createElement('div', { className }, 'No boundary defined');
  }

  // Compute bounding box with padding
  const padding = 0.15;
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  for (const p of boundaryPolygon) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }

  // Add all constraint locations to bounding box
  const allConstraints = [...report.hardConstraints, ...report.softConstraints, ...report.infoConstraints];
  for (const c of allConstraints) {
    if (c.location.lat < minLat) minLat = c.location.lat;
    if (c.location.lat > maxLat) maxLat = c.location.lat;
    if (c.location.lng < minLng) minLng = c.location.lng;
    if (c.location.lng > maxLng) maxLng = c.location.lng;
  }

  const latRange = maxLat - minLat || 0.01;
  const lngRange = maxLng - minLng || 0.01;
  const padLat = latRange * padding;
  const padLng = lngRange * padding;
  minLat -= padLat; maxLat += padLat;
  minLng -= padLng; maxLng += padLng;

  const toX = (lng: number) => ((lng - minLng) / (maxLng - minLng)) * width;
  const toY = (lat: number) => height - ((lat - minLat) / (maxLat - minLat)) * height;

  // Boundary polygon path
  const boundaryPath = boundaryPolygon
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.lng).toFixed(1)},${toY(p.lat).toFixed(1)}`)
    .join(' ') + ' Z';

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
      { viewBox: `0 0 ${width} ${height}`, width: '100%', height: 'auto', style: { display: 'block' } },
      // Exclusion zones
      ...report.exclusionZones.map((zone, i) => {
        if (zone.polygon.length < 3) return null;
        const path = zone.polygon
          .map((p, j) => `${j === 0 ? 'M' : 'L'}${toX(p.lng).toFixed(1)},${toY(p.lat).toFixed(1)}`)
          .join(' ') + ' Z';
        return React.createElement('path', {
          key: `ez-${i}`,
          d: path,
          fill: '#dc2626',
          fillOpacity: 0.15,
          stroke: '#dc2626',
          strokeWidth: 0.5,
          strokeDasharray: '4,2',
        });
      }),
      // Boundary
      React.createElement('path', {
        d: boundaryPath,
        fill: '#2563eb',
        fillOpacity: 0.1,
        stroke: '#2563eb',
        strokeWidth: 2,
      }),
      // Constraint markers
      ...allConstraints.map((c, i) =>
        React.createElement('circle', {
          key: `c-${i}`,
          cx: toX(c.location.lng),
          cy: toY(c.location.lat),
          r: 5,
          fill: SEVERITY_COLORS[c.definition.severity] ?? '#6b7280',
          stroke: '#fff',
          strokeWidth: 1.5,
        }),
      ),
    ),
    // Legend
    React.createElement(
      'div',
      { style: { display: 'flex', gap: '16px', marginTop: '8px', fontSize: '12px' } },
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
        React.createElement('span', null, 'Site'),
      ),
    ),
  );
}
