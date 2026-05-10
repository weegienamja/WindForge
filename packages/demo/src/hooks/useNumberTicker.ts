import { useEffect, useRef, useState } from 'react';

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

export type UseNumberTickerOptions = {
  duration?: number;
  start?: boolean;
};

/**
 * Animates a numeric value from 0 to `target` over `duration` ms using
 * easeOutCubic. Driven by requestAnimationFrame. Holds at 0 until `start`
 * becomes true; replays cleanly when `target` changes.
 */
export function useNumberTicker(target: number, options: UseNumberTickerOptions = {}): number {
  const { duration = 1200, start = true } = options;
  const [value, setValue] = useState(0);
  const frameRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!start) {
      setValue(0);
      return;
    }

    startedAtRef.current = null;
    const tick = (now: number) => {
      if (startedAtRef.current === null) startedAtRef.current = now;
      const elapsed = now - startedAtRef.current;
      const progress = Math.min(1, elapsed / duration);
      setValue(target * easeOutCubic(progress));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        frameRef.current = null;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [target, duration, start]);

  return value;
}
