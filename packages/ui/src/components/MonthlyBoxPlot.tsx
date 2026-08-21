import { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ErrorBar,
} from 'recharts';
import type { BoxPlotData } from '@jamieblair/windforge-core';
import type { WindSiteTheme } from '../styles/theme.js';

export interface MonthlyBoxPlotProps {
  data: BoxPlotData[];
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

export function MonthlyBoxPlot({
  data,
  width,
  height = 300,
  className,
  theme: _theme,
  loading,
}: MonthlyBoxPlotProps) {
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
        aria-label="Loading monthly box plot"
      />
    );
  }
  const chartData = useMemo(() => {
    if (!data.length) return [];
    return data.map((d) => ({
      name: MONTH_LABELS[d.month - 1],
      min: Number(d.min.toFixed(2)),
      q1: Number(d.q1.toFixed(2)),
      median: Number(d.median.toFixed(2)),
      q3: Number(d.q3.toFixed(2)),
      max: Number(d.max.toFixed(2)),
      mean: Number(d.mean.toFixed(2)),
      // For bar: base at q1, height to q3
      iqrBase: Number(d.q1.toFixed(2)),
      iqrHeight: Number((d.q3 - d.q1).toFixed(2)),
      // Error bars from q1 down to min and from q3 up to max
      lowerWhisker: Number((d.q1 - d.min).toFixed(2)),
      upperWhisker: Number((d.max - d.q3).toFixed(2)),
    }));
  }, [data]);

  if (chartData.length === 0) {
    return (
      <div className={className} style={{ padding: 20, textAlign: 'center', color: '#888' }}>
        No box plot data available
      </div>
    );
  }

  return (
    <div
      className={className}
      role="img"
      aria-label="Monthly wind speed box plot showing distribution by calendar month"
    >
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
        Monthly Wind Speed Distribution
      </div>
      <ResponsiveContainer width={width ?? '100%'} height={height}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis
            tick={{ fontSize: 11 }}
            label={{ value: 'm/s', angle: -90, position: 'insideLeft' } as never}
          />
          <Tooltip
            formatter={((value: number, name: string) => [`${value} m/s`, name]) as never}
            contentStyle={{ fontSize: 12 }}
          />
          <Legend />
          <Bar
            dataKey="iqrHeight"
            stackId="box"
            fill="#3b82f6"
            fillOpacity={0.5}
            name="IQR"
            barSize={20}
          >
            <ErrorBar dataKey="upperWhisker" direction="y" stroke="#333" width={8} />
          </Bar>
          <Bar dataKey="iqrBase" stackId="box" fill="transparent" name="" barSize={20}>
            <ErrorBar dataKey="lowerWhisker" direction="y" stroke="#333" width={8} />
          </Bar>
          <Line
            type="monotone"
            dataKey="median"
            stroke="#ef4444"
            dot={{ r: 3 }}
            name="Median"
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="mean"
            stroke="#22c55e"
            dot={{ r: 3 }}
            name="Mean"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
