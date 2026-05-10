'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNumberTicker } from '../../hooks/useNumberTicker';

export type NumberTickerProps = {
  value: number;
  duration?: number;
  precision?: number;
  className?: string;
  style?: CSSProperties;
};

const defaultMargin = '0px 0px -20% 0px';

export function NumberTicker({
  value,
  duration = 1200,
  precision = 0,
  className,
  style,
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: defaultMargin, threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const animated = useNumberTicker(value, { duration, start: inView });
  const formatted = animated.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });

  return (
    <span
      ref={ref}
      className={className}
      style={{
        fontFamily: 'var(--font-mono)',
        fontVariantNumeric: 'tabular-nums',
        fontFeatureSettings: '"tnum"',
        ...style,
      }}
      aria-label={String(value)}
    >
      {formatted}
    </span>
  );
}
