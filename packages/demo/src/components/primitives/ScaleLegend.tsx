import type { CSSProperties } from 'react';

export type ScaleLegendProps = {
  min: number;
  max: number;
  unit: string;
  colors: string[];
  label?: string;
  className?: string;
  style?: CSSProperties;
};

export function ScaleLegend({ min, max, unit, colors, label, className, style }: ScaleLegendProps) {
  const stops = colors
    .map((c, i) => `${c} ${(i / (colors.length - 1)) * 100}%`)
    .join(', ');
  const mid = (min + max) / 2;
  const fmt = (v: number) =>
    v.toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 0 });

  return (
    <div
      role="group"
      aria-label={label ?? `Colour scale ${min}–${max} ${unit}`}
      className={className}
      style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, minWidth: 180, ...style }}
    >
      {label ? <div className="t-eyebrow">{label}</div> : null}
      <div
        aria-hidden="true"
        style={{
          width: '100%',
          height: 8,
          borderRadius: 2,
          background: `linear-gradient(to right, ${stops})`,
          border: '1px solid var(--border-subtle)',
        }}
      />
      <div
        className="t-caption"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          fontFamily: 'var(--font-mono)',
          fontVariantNumeric: 'tabular-nums',
          fontSize: 11,
          color: 'var(--text-tertiary)',
        }}
      >
        <span style={{ textAlign: 'left' }}>{fmt(min)}</span>
        <span style={{ textAlign: 'center' }}>{fmt(mid)}</span>
        <span style={{ textAlign: 'right' }}>
          {fmt(max)} <span style={{ marginLeft: 4 }}>{unit}</span>
        </span>
      </div>
    </div>
  );
}
