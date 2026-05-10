import { useMemo } from 'react';
import {
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ComposedChart,
} from 'recharts';
import type { SpeedDistributionResult } from '@jamieblair/windforge-core';
import type { WindSiteTheme } from '../styles/theme.js';

export interface WindSpeedDistributionProps {
  data: SpeedDistributionResult;
  width?: number;
  height?: number;
  className?: string;
  theme?: Partial<WindSiteTheme>;
  /** Show a loading skeleton instead of the chart. */
  loading?: boolean;
}

export function WindSpeedDistribution({ data, width, height = 300, className, theme: _theme, loading }: WindSpeedDistributionProps) {
  // Hooks must run unconditionally on every render (Rules of Hooks).
  // Calling useMemo after an early return for `loading` previously violated this and
  // caused React to throw when the loading prop toggled.
  const chartData = useMemo(() => {
    if (!data?.bins?.length) return [];
    return data.bins.map((b: { binStart: number; binEnd: number; frequency: number; weibullFrequency: number }) => ({
      name: `${b.binStart}–${b.binEnd}`,
      frequency: Number((b.frequency * 100).toFixed(1)),
      weibull: Number((b.weibullFrequency * 100).toFixed(1)),
    }));
  }, [data]);

  if (loading) {
    return <div className={className} style={{ height, background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'wsi-shimmer 1.5s infinite', borderRadius: 8 }} aria-busy="true" aria-label="Loading wind speed distribution" />;
  }

  if (chartData.length === 0) {
    return <div className={className} style={{ padding: 20, textAlign: 'center', color: '#888' }}>No distribution data available</div>;
  }

  return (
    <div className={className} role="img" aria-label="Wind speed frequency distribution with Weibull curve fit">
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
        Wind Speed Distribution
        <span style={{ fontWeight: 400, marginLeft: 8, color: '#666' }}>
          (Weibull k={data.weibullK.toFixed(2)}, c={data.weibullC.toFixed(2)})
        </span>
      </div>
      <ResponsiveContainer width={width ?? '100%'} height={height}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} label={{ value: 'm/s', position: 'insideBottomRight', offset: -5 } as never} />
          <YAxis tick={{ fontSize: 11 }} label={{ value: '%', angle: -90, position: 'insideLeft' } as never} />
          <Tooltip
            formatter={((value: number, name: string) => [`${value}%`, name]) as never}
            contentStyle={{ fontSize: 12 }}
          />
          <Legend />
          <Bar dataKey="frequency" fill="#3b82f6" fillOpacity={0.6} name="Observed" />
          <Line type="monotone" dataKey="weibull" stroke="#ef4444" strokeWidth={2} dot={false} name="Weibull fit" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
