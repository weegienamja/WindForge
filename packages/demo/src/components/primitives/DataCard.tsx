import type { CSSProperties, ReactNode } from 'react';

export type DataCardProps = {
  eyebrow?: string;
  title?: ReactNode;
  unit?: string;
  interactive?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

/**
 * Rectangular data-UI card. No oversized rounding (>4px reads as marketing).
 * Slots: eyebrow (caps mono label), title (heading), optional unit, body.
 */
export function DataCard({
  eyebrow,
  title,
  unit,
  interactive = false,
  className,
  style,
  children,
}: DataCardProps) {
  return (
    <div
      data-interactive={interactive ? 'true' : undefined}
      className={className}
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 4,
        padding: 'var(--space-5)',
        transition:
          'background var(--duration-fast) var(--easing-standard), border-color var(--duration-fast) var(--easing-standard)',
        ...style,
      }}
      onMouseEnter={
        interactive
          ? (e) => {
              e.currentTarget.style.background = 'var(--surface-elevated)';
              e.currentTarget.style.borderColor = 'var(--border-strong)';
            }
          : undefined
      }
      onMouseLeave={
        interactive
          ? (e) => {
              e.currentTarget.style.background = 'var(--surface-1)';
              e.currentTarget.style.borderColor = 'var(--border-subtle)';
            }
          : undefined
      }
    >
      {eyebrow ? <div className="t-eyebrow" style={{ marginBottom: 'var(--space-2)' }}>{eyebrow}</div> : null}
      {title ? (
        <div className="t-h3" style={{ marginBottom: children ? 'var(--space-3)' : 0 }}>
          {title}
          {unit ? (
            <span className="t-caption" style={{ marginLeft: 'var(--space-2)' }}>
              {unit}
            </span>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
