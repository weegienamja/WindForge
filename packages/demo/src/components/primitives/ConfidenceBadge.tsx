import type { CSSProperties } from 'react';

export type Confidence = 'high' | 'medium' | 'low';

export type ConfidenceBadgeProps = {
  confidence: Confidence;
  className?: string;
  style?: CSSProperties;
};

const LABELS: Record<Confidence, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

export function ConfidenceBadge({ confidence, className, style }: ConfidenceBadgeProps) {
  return (
    <span
      className={className}
      role="status"
      aria-label={LABELS[confidence]}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        borderRadius: 999,
        border: '1px solid var(--border-subtle)',
        background: 'var(--surface-1)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--text-secondary)',
        ...style,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: `var(--confidence-${confidence})`,
        }}
      />
      {confidence}
    </span>
  );
}
