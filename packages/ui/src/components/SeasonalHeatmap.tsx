import { useMemo } from 'react';
import type { SeasonalHeatmapCell, SeasonalHeatmapResult } from '@jamieblair/windforge-core';
import type { WindSiteTheme } from '../styles/theme.js';

export interface SeasonalHeatmapProps {
  data: SeasonalHeatmapCell[] | SeasonalHeatmapResult;
  width?: number;
  height?: number;
  className?: string;
  theme?: Partial<WindSiteTheme>;
  /** Show a loading skeleton instead of the chart. */
  loading?: boolean;
}

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function speedToColor(speed: number, maxSpeed: number): string {
  if (maxSpeed === 0) return '#f0f0f0';
  const ratio = Math.min(speed / maxSpeed, 1);
  // Blue (low) → green (mid) → red (high)
  if (ratio < 0.5) {
    const t = ratio * 2;
    const r = Math.round(66 + 34 * t);
    const g = Math.round(133 + 122 * t);
    const b = Math.round(244 - 100 * t);
    return `rgb(${r},${g},${b})`;
  }
  const t = (ratio - 0.5) * 2;
  const r = Math.round(100 + 155 * t);
  const g = Math.round(255 - 155 * t);
  const b = Math.round(144 - 100 * t);
  return `rgb(${r},${g},${b})`;
}

export function SeasonalHeatmap({
  data,
  width = 600,
  height = 320,
  className,
  theme: _theme,
  loading,
}: SeasonalHeatmapProps) {
  const { cells, maxSpeed } = useMemo(() => {
    const raw = Array.isArray(data) ? data : data.cells;
    const max = raw.reduce((m, c) => Math.max(m, c.speedMs), 0);
    return { cells: raw, maxSpeed: max };
  }, [data]);

  if (loading) {
    return (
      <div
        className={className}
        style={{
          height,
          background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
          backgroundSize: '200% 100%',
          animation: 'wsi-shimmer 1.5s infinite',
          borderRadius: 8,
        }}
        aria-busy="true"
        aria-label="Loading seasonal heatmap"
      />
    );
  }

  if (cells.length === 0) {
    return (
      <div className={className} style={{ padding: 20, textAlign: 'center', color: '#888' }}>
        No seasonal data available
      </div>
    );
  }

  const marginLeft = 40;
  const marginTop = 30;
  const marginBottom = 30;
  const marginRight = 60;
  const plotW = width - marginLeft - marginRight;
  const plotH = height - marginTop - marginBottom;
  const cellW = plotW / 24;
  const cellH = plotH / 12;

  return (
    <div
      className={className}
      role="img"
      aria-label="Seasonal heatmap showing average wind speed by month and hour"
    >
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
        Seasonal Heatmap (Month × Hour)
      </div>
      <svg width={width} height={height} style={{ fontFamily: 'sans-serif' }}>
        {cells.map((c) => (
          <rect
            key={`${c.month}-${c.hour}`}
            x={marginLeft + c.hour * cellW}
            y={marginTop + (c.month - 1) * cellH}
            width={cellW - 1}
            height={cellH - 1}
            fill={speedToColor(c.speedMs, maxSpeed)}
            rx={1}
          >
            <title>{`${MONTH_LABELS[c.month - 1]} ${c.hour}:00, ${c.speedMs.toFixed(1)} m/s`}</title>
          </rect>
        ))}
        {/* Hour labels */}
        {Array.from({ length: 24 }, (_, h) => (
          <text
            key={`h${h}`}
            x={marginLeft + h * cellW + cellW / 2}
            y={height - marginBottom + 16}
            textAnchor="middle"
            fontSize={9}
            fill="#666"
          >
            {h}
          </text>
        ))}
        {/* Month labels */}
        {MONTH_LABELS.map((label, i) => (
          <text
            key={label}
            x={marginLeft - 6}
            y={marginTop + i * cellH + cellH / 2 + 4}
            textAnchor="end"
            fontSize={10}
            fill="#666"
          >
            {label}
          </text>
        ))}
        {/* Axis titles */}
        <text
          x={marginLeft + plotW / 2}
          y={height - 2}
          textAnchor="middle"
          fontSize={11}
          fill="#333"
        >
          Hour of day
        </text>
        {/* Legend bar */}
        {Array.from({ length: 10 }, (_, i) => {
          const val = (i / 9) * maxSpeed;
          return (
            <rect
              key={`leg${i}`}
              x={width - marginRight + 10}
              y={marginTop + i * (plotH / 10)}
              width={14}
              height={plotH / 10}
              fill={speedToColor(val, maxSpeed)}
            />
          );
        })}
        <text x={width - marginRight + 30} y={marginTop + 10} fontSize={9} fill="#666">
          {maxSpeed.toFixed(1)}
        </text>
        <text x={width - marginRight + 30} y={marginTop + plotH} fontSize={9} fill="#666">
          0
        </text>
        <text x={width - marginRight + 30} y={marginTop + plotH / 2} fontSize={9} fill="#666">
          m/s
        </text>
      </svg>
    </div>
  );
}
