import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Line,
} from 'recharts';
import type { DiurnalPoint, DiurnalProfileResult } from '@jamieblair/windforge-core';
import type { WindSiteTheme } from '../styles/theme.js';

export interface DiurnalProfileProps {
  data: DiurnalPoint[] | DiurnalProfileResult;
  width?: number;
  height?: number;
  className?: string;
  theme?: Partial<WindSiteTheme>;
  /** Show a loading skeleton instead of the chart. */
  loading?: boolean;
}

export function DiurnalProfile({
  data,
  width,
  height = 300,
  className,
  theme: _theme,
  loading,
}: DiurnalProfileProps) {
  const chartData = useMemo(() => {
    const points = Array.isArray(data) ? data : data.hours;
    if (!points.length) return [];
    return points.map((d) => ({
      hour: `${String(d.hour).padStart(2, '0')}:00`,
      mean: Number(d.meanSpeedMs.toFixed(2)),
      min: Number(d.minSpeedMs.toFixed(2)),
      max: Number(d.maxSpeedMs.toFixed(2)),
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
        aria-label="Loading diurnal profile"
      />
    );
  }

  if (chartData.length === 0) {
    return (
      <div className={className} style={{ padding: 20, textAlign: 'center', color: '#888' }}>
        No diurnal data available
      </div>
    );
  }

  return (
    <div
      className={className}
      role="img"
      aria-label="Diurnal wind speed profile showing average speed by hour of day"
    >
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
        Diurnal Wind Speed Profile
      </div>
      <ResponsiveContainer width={width ?? '100%'} height={height}>
        <AreaChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={2} />
          <YAxis
            tick={{ fontSize: 11 }}
            label={{ value: 'm/s', angle: -90, position: 'insideLeft' } as never}
          />
          <Tooltip
            formatter={((value: number, name: string) => [`${value} m/s`, name]) as never}
            contentStyle={{ fontSize: 12 }}
          />
          <Legend />
          <Area
            type="monotone"
            dataKey="max"
            stroke="#ef4444"
            fill="#fecaca"
            fillOpacity={0.3}
            name="Max"
          />
          <Area
            type="monotone"
            dataKey="min"
            stroke="#3b82f6"
            fill="#bfdbfe"
            fillOpacity={0.3}
            name="Min"
          />
          <Line
            type="monotone"
            dataKey="mean"
            stroke="#22c55e"
            strokeWidth={2}
            dot={false}
            name="Mean"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
