import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { WindTrendResult } from '@jamieblair/windforge-core';
import type { WindSiteTheme } from '../styles/theme.js';

export interface WindTrendChartProps {
  data: WindTrendResult;
  width?: number;
  height?: number;
  className?: string;
  theme?: Partial<WindSiteTheme>;
  /** Show a loading skeleton instead of the chart. */
  loading?: boolean;
}

const MONTH_NAMES = [
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

export function WindTrendChart({
  data,
  width,
  height = 300,
  className,
  theme: _theme,
  loading,
}: WindTrendChartProps) {
  const chartData = useMemo(() => {
    if (!data.points.length) return [];
    return data.points.map((p) => ({
      label: `${MONTH_NAMES[p.month - 1]} ${p.year}`,
      speed: Number(p.speedMs.toFixed(2)),
      trend: Number(p.trendMs.toFixed(2)),
    }));
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
        aria-label="Loading wind trend chart"
      />
    );
  }

  if (chartData.length === 0 || data.slopePerYear === null || data.rSquared === null) {
    return (
      <div className={className} style={{ padding: 20, textAlign: 'center', color: '#888' }}>
        No trend data available
      </div>
    );
  }

  const slopeText =
    data.slopePerYear >= 0
      ? `+${data.slopePerYear.toFixed(3)} m/s per year`
      : `${data.slopePerYear.toFixed(3)} m/s per year`;

  return (
    <div
      className={className}
      role="img"
      aria-label="Wind speed trend chart showing historical wind data with regression line"
    >
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
        Wind Speed Trend
        <span style={{ fontWeight: 400, marginLeft: 8, color: '#666' }}>
          ({slopeText}, R²={data.rSquared.toFixed(3)})
        </span>
      </div>
      <ResponsiveContainer width={width ?? '100%'} height={height}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={11} />
          <YAxis
            tick={{ fontSize: 11 }}
            label={{ value: 'm/s', angle: -90, position: 'insideLeft' } as never}
          />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="speed"
            stroke="#3b82f6"
            dot={false}
            name="Speed (m/s)"
            strokeWidth={1}
          />
          <Line
            type="monotone"
            dataKey="trend"
            stroke="#ef4444"
            dot={false}
            name="Trend"
            strokeWidth={2}
            strokeDasharray="5 5"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
