import type { CSSProperties } from 'react';
import { ConfidenceBadge, type Confidence } from './ConfidenceBadge';

export type NumericReadoutProps = {
  value: number | string;
  unit?: string;
  precision?: number;
  confidence?: Confidence;
  trend?: 'up' | 'down' | 'flat';
  size?: 'data' | 'large';
  className?: string;
  style?: CSSProperties;
};

const TREND_GLYPH: Record<NonNullable<NumericReadoutProps['trend']>, string> = {
  up: '▲',
  down: '▼',
  flat: '−',
};

const TREND_COLOUR: Record<NonNullable<NumericReadoutProps['trend']>, string> = {
  up: 'var(--accent-cool)',
  down: 'var(--accent-warm)',
  flat: 'var(--text-tertiary)',
};

export function NumericReadout({
  value,
  unit,
  precision = 1,
  confidence,
  trend,
  size = 'data',
  className,
  style,
}: NumericReadoutProps) {
  const formatted =
    typeof value === 'number'
      ? value.toLocaleString(undefined, {
          minimumFractionDigits: precision,
          maximumFractionDigits: precision,
        })
      : value;

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 'var(--space-2)',
        ...style,
      }}
    >
      {confidence ? <ConfidenceBadge confidence={confidence} /> : null}
      <span className={size === 'large' ? 't-mono-large' : 't-mono-data'}>{formatted}</span>
      {unit ? (
        <span className="t-caption" data-testid="readout-unit">
          {unit}
        </span>
      ) : null}
      {trend ? (
        <span
          aria-label={`trend ${trend}`}
          style={{ color: TREND_COLOUR[trend], fontSize: 12, marginLeft: 4 }}
        >
          {TREND_GLYPH[trend]}
        </span>
      ) : null}
    </span>
  );
}
