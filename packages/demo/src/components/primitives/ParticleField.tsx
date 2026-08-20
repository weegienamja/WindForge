'use client';

import { useEffect, useRef, type CSSProperties } from 'react';

export type WindFieldVector = { lat: number; lng: number; u: number; v: number };

export type ParticleFieldProps = {
  /** Path to a JSON wind field, served from /public. */
  src?: string;
  /** Pre-loaded wind field vectors (overrides src). */
  vectors?: WindFieldVector[];
  /** Pixels-per-frame per m/s of wind speed. */
  speedScale?: number;
  /** Min/max particle lifetime in frames. */
  minAge?: number;
  maxAge?: number;
  /** Trail fade alpha (per-frame background overdraw). */
  fadeAlpha?: number;
  /** Particle stroke colour, falls back to var(--accent-cool). */
  particleColor?: string;
  /** Background colour for the trail fade, must match the page surface. */
  backgroundColor?: string;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
};

type Particle = { x: number; y: number; px: number; py: number; age: number; maxAge: number };

const DEFAULT_SRC = '/wind-field.json';

function bilinearLookup(
  vectors: WindFieldVector[],
  resolution: number,
  lat: number,
  lng: number,
): { u: number; v: number } {
  // Snap to grid; vectors are stored on a regular lat/lng grid.
  const lat0 = Math.floor(lat / resolution) * resolution;
  const lng0 = Math.floor(lng / resolution) * resolution;
  // Naive nearest-cell lookup. For a coarse 5° grid the simple lookup is
  // visually fine and avoids an O(n) scan per particle per frame.
  let best: WindFieldVector | undefined;
  let bestD = Infinity;
  for (const v of vectors) {
    const dlat = v.lat - lat0;
    const dlng = v.lng - lng0;
    const d = dlat * dlat + dlng * dlng;
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best ? { u: best.u, v: best.v } : { u: 0, v: 0 };
}

function detectResolution(vectors: WindFieldVector[]): number {
  // Infer grid spacing from the smallest non-zero lat delta in the data.
  if (vectors.length < 2) return 5;
  let smallest = 360;
  for (let i = 1; i < Math.min(vectors.length, 200); i += 1) {
    const a = vectors[i];
    const b = vectors[i - 1];
    if (!a || !b) continue;
    const d = Math.abs(a.lat - b.lat);
    if (d > 0.001 && d < smallest) smallest = d;
  }
  return smallest > 0 && smallest < 90 ? smallest : 5;
}

function makeLookup(vectors: WindFieldVector[]) {
  const resolution = detectResolution(vectors);
  // Build a Map keyed by snapped grid for O(1) lookup.
  const map = new Map<string, { u: number; v: number }>();
  for (const v of vectors) {
    const lat0 = Math.round(v.lat / resolution) * resolution;
    const lng0 = Math.round(v.lng / resolution) * resolution;
    map.set(`${lat0},${lng0}`, { u: v.u, v: v.v });
  }
  return (lat: number, lng: number) => {
    const lat0 = Math.round(lat / resolution) * resolution;
    const lng0 = Math.round(lng / resolution) * resolution;
    const hit = map.get(`${lat0},${lng0}`);
    if (hit) return hit;
    return bilinearLookup(vectors, resolution, lat, lng);
  };
}

function projectScreenToLatLng(x: number, y: number, w: number, h: number) {
  // Equirectangular mapping: x [0, w] → lng [-180, 180], y [0, h] → lat [70, -60]
  const lng = (x / w) * 360 - 180;
  const lat = 70 - (y / h) * 130;
  return { lat, lng };
}

export function ParticleField({
  src = DEFAULT_SRC,
  vectors: externalVectors,
  speedScale = 0.5,
  minAge = 80,
  maxAge = 120,
  fadeAlpha = 0.05,
  particleColor,
  backgroundColor,
  className,
  style,
  ariaLabel = 'Animated global wind field',
}: ParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const vectorsRef = useRef<WindFieldVector[] | null>(externalVectors ?? null);
  const lookupRef = useRef<((lat: number, lng: number) => { u: number; v: number }) | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (externalVectors) {
      vectorsRef.current = externalVectors;
      lookupRef.current = makeLookup(externalVectors);
      return;
    }
    fetch(src)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: WindFieldVector[]) => {
        if (cancelled) return;
        vectorsRef.current = data;
        lookupRef.current = makeLookup(data);
      })
      .catch(() => {
        // Silent: the canvas will simply render the background fill until
        // a field is available. The hero copy is the primary message.
      });
    return () => {
      cancelled = true;
    };
  }, [externalVectors, src]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const matches = (q: string) =>
      typeof window !== 'undefined' && window.matchMedia(q).matches;
    // Scale particle density to the viewport so phones stay smooth and
    // battery-friendly while desktops get the full dense field.
    const particleCount = matches('(max-width: 767px)')
      ? 600
      : matches('(max-width: 1280px)')
        ? 1500
        : 3000;

    let width = 0;
    let height = 0;
    let dpr = 1;

    const resolveBg = () => {
      if (backgroundColor) return backgroundColor;
      if (typeof window !== 'undefined') {
        const s = getComputedStyle(document.documentElement)
          .getPropertyValue('--surface-0')
          .trim();
        if (s) return s;
      }
      return '#0a0e1a';
    };
    const resolveParticle = () => {
      if (particleColor) return particleColor;
      if (typeof window !== 'undefined') {
        const s = getComputedStyle(document.documentElement)
          .getPropertyValue('--accent-cool')
          .trim();
        if (s) return s;
      }
      return '#6ba9ff';
    };

    const bg = resolveBg();
    const stroke = resolveParticle();

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);
    };

    const initParticles = () => {
      const arr: Particle[] = new Array(particleCount);
      for (let i = 0; i < particleCount; i += 1) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        arr[i] = {
          x,
          y,
          px: x,
          py: y,
          age: Math.floor(Math.random() * maxAge),
          maxAge: minAge + Math.floor(Math.random() * (maxAge - minAge)),
        };
      }
      particlesRef.current = arr;
    };

    const respawn = (p: Particle) => {
      p.x = Math.random() * width;
      p.y = Math.random() * height;
      p.px = p.x;
      p.py = p.y;
      p.age = 0;
      p.maxAge = minAge + Math.floor(Math.random() * (maxAge - minAge));
    };

    const step = () => {
      const lookup = lookupRef.current;
      const particles = particlesRef.current;
      if (!particles.length) return;

      // Trail fade: paint a translucent background over the previous frame.
      ctx.fillStyle = `${bg}`;
      ctx.globalAlpha = fadeAlpha;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;

      ctx.strokeStyle = stroke;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1.2;
      ctx.beginPath();

      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        if (!p) continue;
        if (!lookup) {
          // No field loaded yet, drift slowly so the canvas isn't dead.
          p.px = p.x;
          p.py = p.y;
          p.x += 0.2;
          if (p.x > width) p.x = 0;
          continue;
        }
        const { lat, lng } = projectScreenToLatLng(p.x, p.y, width, height);
        const { u, v } = lookup(lat, lng);
        p.px = p.x;
        p.py = p.y;
        // u = east-west wind (px), v = north-south. Screen y grows downward
        // so subtract v.
        p.x += u * speedScale;
        p.y -= v * speedScale;
        p.age += 1;

        if (
          p.age > p.maxAge ||
          p.x < 0 ||
          p.x > width ||
          p.y < 0 ||
          p.y > height
        ) {
          respawn(p);
          continue;
        }

        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.x, p.y);
      }

      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    const loop = () => {
      step();
      rafRef.current = requestAnimationFrame(loop);
    };

    resize();
    initParticles();

    if (reduceMotion) {
      // Render a single static snapshot frame and stop.
      step();
      step();
      return () => undefined;
    }

    const handleResize = () => {
      resize();
      initParticles();
    };
    const handleVisibility = () => {
      if (document.hidden) {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      } else if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(loop);
      }
    };

    window.addEventListener('resize', handleResize);
    document.addEventListener('visibilitychange', handleVisibility);
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [backgroundColor, particleColor, speedScale, minAge, maxAge, fadeAlpha]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={ariaLabel}
      className={className}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        background: 'var(--surface-0)',
        ...style,
      }}
    />
  );
}
