import type { ReactNode } from 'react';
import React, { useMemo } from 'react';
import type { WindSiteTheme } from '../styles/theme.js';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';

/** 16-point compass directions in clockwise order from North. */
export const COMPASS_DIRECTIONS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
] as const;

export type CompassDirection = (typeof COMPASS_DIRECTIONS)[number];

/** Wind speed band definition for colour-coding the rose. */
export interface WindSpeedBand {
  /** Lower bound (inclusive) of speed band in m/s. */
  minMs: number;
  /** Upper bound (exclusive) of speed band in m/s. Use Infinity for final band. */
  maxMs: number;
  /** Display label, e.g. "4–8 m/s". */
  label: string;
  /** Fill colour for the radar polygon. */
  color: string;
}

/** Frequency data for a single compass direction. */
export interface WindRoseDirectionData {
  /** Compass direction label. */
  direction: CompassDirection;
  /** Frequency (%) per speed band. Keys must match WindSpeedBand.label. */
  [bandLabel: string]: number | string;
}

export interface WindRoseProps {
  /** Directional frequency data – one entry per compass direction. */
  data: WindRoseDirectionData[];
  /** Speed bands to render. Order matters – first is inner, last is outer. */
  bands: WindSpeedBand[];
  /** Chart width/height in px (chart is square). Default 400. */
  size?: number;
  /** Optional CSS class name. */
  className?: string;
  /** Optional theme overrides. */
  theme?: Partial<WindSiteTheme>;
}

/** Default speed bands matching common wind industry categories. */
export const DEFAULT_WIND_BANDS: WindSpeedBand[] = [
  { minMs: 0, maxMs: 4, label: '0–4 m/s', color: '#93c5fd' },
  { minMs: 4, maxMs: 8, label: '4–8 m/s', color: '#3b82f6' },
  { minMs: 8, maxMs: 12, label: '8–12 m/s', color: '#1d4ed8' },
  { minMs: 12, maxMs: Infinity, label: '12+ m/s', color: '#1e3a5f' },
];

/**
 * Bucket degrees (0–360) into one of 16 compass directions.
 * 0° = North, increasing clockwise.
 */
export function degreesToCompass(deg: number): CompassDirection {
  const normalised = ((deg % 360) + 360) % 360;
  const index = Math.round(normalised / 22.5) % 16;
  return COMPASS_DIRECTIONS[index] as CompassDirection;
}

/**
 * Build empty WindRoseDirectionData rows for all 16 directions,
 * with every band label initialised to 0.
 */
export function emptyRoseData(bands: WindSpeedBand[]): WindRoseDirectionData[] {
  return COMPASS_DIRECTIONS.map((dir) => {
    const row: WindRoseDirectionData = { direction: dir };
    for (const b of bands) {
      row[b.label] = 0;
    }
    return row;
  });
}

/**
 * Wind rose polar chart visualising directional wind frequency
 * colour-coded by speed bands.
 *
 * Uses Recharts RadarChart with stacked Radar layers.
 */
export function WindRose({ data, bands, size = 400, className, theme: _theme }: WindRoseProps): ReactNode {
  // Ensure data ordering matches COMPASS_DIRECTIONS
  const orderedData = useMemo(() => {
    const lookup = new Map(data.map((d) => [d.direction, d]));
    return COMPASS_DIRECTIONS.map((dir) => lookup.get(dir) ?? { direction: dir });
  }, [data]);

  return React.createElement(
    'div',
    {
      className,
      // Responsive: fill the available width up to `size`, staying square via
      // aspect-ratio so the rose never overflows on narrow (mobile) viewports.
      style: { width: '100%', maxWidth: size, aspectRatio: '1 / 1', margin: '0 auto' },
      role: 'img',
      'aria-label': 'Wind rose chart showing directional wind frequency by speed band',
    },
    React.createElement(
      ResponsiveContainer,
      { width: '100%', height: '100%', children: null as unknown as React.ReactElement },
      React.createElement(
        RadarChart,
        { data: orderedData, cx: '50%', cy: '50%', outerRadius: '75%' },
        React.createElement(PolarGrid, null),
        React.createElement(PolarAngleAxis, {
          dataKey: 'direction',
          tick: { fontSize: 11, fill: 'var(--wsi-text, #0f172a)' },
        }),
        React.createElement(PolarRadiusAxis, {
          angle: 90,
          tick: { fontSize: 10 },
          tickFormatter: (v: number) => `${v}%`,
        }),
        // Render bands from last (outermost) to first so inner layers paint on top
        ...([...bands].reverse().map((band) =>
          React.createElement(Radar, {
            key: band.label,
            name: band.label,
            dataKey: band.label,
            stroke: band.color,
            fill: band.color,
            fillOpacity: 0.5,
          }),
        )),
        React.createElement(Tooltip, {
          formatter: ((value: unknown) => `${Number(value ?? 0).toFixed(1)}%`) as never,
        }),
        React.createElement(Legend, {
          wrapperStyle: { fontSize: '12px' },
        }),
      ),
    ),
  );
}
