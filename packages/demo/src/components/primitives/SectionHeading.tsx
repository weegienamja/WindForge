import type { CSSProperties, ReactNode } from 'react';

export type SectionHeadingProps = {
  eyebrow: string;
  align?: 'left' | 'center';
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function SectionHeading({
  eyebrow,
  align = 'left',
  children,
  className,
  style,
}: SectionHeadingProps) {
  return (
    <header
      className={className}
      style={{
        textAlign: align,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        alignItems: align === 'center' ? 'center' : 'flex-start',
        ...style,
      }}
    >
      <div className="t-eyebrow">{eyebrow}</div>
      <h2 className="t-h2" style={{ margin: 0 }}>
        {children}
      </h2>
    </header>
  );
}
