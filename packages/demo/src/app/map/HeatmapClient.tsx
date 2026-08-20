'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { scoreColor, type HeatmapCell, type HeatmapData } from '../../lib/heatmap';
import { Footer } from '../../components/Footer';

const HeatmapLeaflet = dynamic(
  () => import('../../components/map/HeatmapLeaflet').then((m) => m.HeatmapLeaflet),
  {
    ssr: false,
    loading: () => (
      <div
        className="t-mono-data"
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary)',
        }}
      >
        Loading map…
      </div>
    ),
  },
);

const POLL_MS = 6000;

export function HeatmapClient() {
  return (
    <Suspense fallback={null}>
      <HeatmapInner />
    </Suspense>
  );
}

function useHeatmapFeed(url: string): { data: HeatmapData | null; error: string | null } {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as HeatmapData;
        if (cancelled) return;
        setData(json);
        setError(null);
        // Keep polling until the run is complete (or forever for a live feed).
        if (!json.meta?.complete) timerRef.current = setTimeout(poll, POLL_MS);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load heatmap data');
        timerRef.current = setTimeout(poll, POLL_MS * 2);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [url]);

  return { data, error };
}

function HeatmapInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Data source: ?src= overrides the build-time default, which is the live
  // worker URL (NEXT_PUBLIC_HEATMAP_URL) or the committed snapshot.
  const url = useMemo(() => {
    const fromQuery = searchParams?.get('src');
    if (fromQuery) return fromQuery;
    return process.env.NEXT_PUBLIC_HEATMAP_URL || '/heatmap.json';
  }, [searchParams]);

  const { data, error } = useHeatmapFeed(url);
  const meta = data?.meta;
  const cells = data?.cells ?? [];
  const scored = cells.filter((c) => c.score !== null && c.score !== undefined);
  const pct = meta && meta.total > 0 ? Math.round((meta.done / meta.total) * 100) : 0;
  const hasData = scored.length > 0;

  const onPick = (cell: HeatmapCell) => {
    router.push(`/analyse?lat=${cell.lat}&lng=${cell.lng}&hub=${meta?.hubHeightM ?? 100}`);
  };

  return (
    <main style={{ minHeight: '100vh', background: 'var(--surface-0)', color: 'var(--text-primary)' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: 'var(--surface-1)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: 'var(--space-3) var(--space-5)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 'var(--space-4)',
        }}
      >
        <Link
          href="/"
          className="t-mono-data"
          style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 12 }}
        >
          ← WindForge
        </Link>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="t-eyebrow">UK suitability heatmap</div>
          <div className="t-mono-data" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {meta?.source ?? 'six-factor composite'} · {meta?.spacingKm ?? '–'} km grid
          </div>
        </div>
        <ProgressReadout done={meta?.done ?? 0} total={meta?.total ?? 0} pct={pct} complete={!!meta?.complete} />
      </header>

      {meta && meta.total > 0 ? (
        <div style={{ height: 3, background: 'var(--surface-elevated)' }}>
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: 'var(--accent-cool)',
              transition: 'width var(--duration-medium) var(--easing-standard)',
            }}
          />
        </div>
      ) : null}

      <div style={{ position: 'relative', height: 'calc(100vh - 180px)', minHeight: 420 }}>
        <HeatmapLeaflet cells={scored} meta={meta ?? FALLBACK_META} onPick={onPick} />
        <Legend />
        {!hasData ? <EmptyOverlay error={error} url={url} /> : null}
      </div>

      <Footer />
    </main>
  );
}

function ProgressReadout({
  done,
  total,
  pct,
  complete,
}: {
  done: number;
  total: number;
  pct: number;
  complete: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <span
        className="t-eyebrow"
        style={{
          color: complete ? 'var(--confidence-high)' : 'var(--accent-cool)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: complete ? 'var(--confidence-high)' : 'var(--accent-cool)',
          }}
        />
        {complete ? 'Complete' : 'Live'}
      </span>
      <span className="t-mono-data" style={{ fontSize: 13 }}>
        {done.toLocaleString()} / {total.toLocaleString()} ({pct}%)
      </span>
    </div>
  );
}

function Legend() {
  const stops = [0, 25, 45, 62, 80, 100];
  const gradient = `linear-gradient(90deg, ${stops.map((s) => `${scoreColor(s)} ${s}%`).join(', ')})`;
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 'var(--space-4)',
        left: 'var(--space-4)',
        zIndex: 1000,
        background: 'var(--surface-1)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 4,
        padding: 'var(--space-3)',
        width: 220,
      }}
    >
      <div className="t-eyebrow" style={{ marginBottom: 6 }}>
        Suitability score
      </div>
      <div style={{ height: 10, borderRadius: 2, background: gradient }} />
      <div
        className="t-mono-data"
        style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: 'var(--text-secondary)' }}
      >
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  );
}

function EmptyOverlay({ error, url }: { error: string | null; url: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          maxWidth: 440,
          background: 'var(--surface-1)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 4,
          padding: 'var(--space-5)',
          pointerEvents: 'auto',
        }}
      >
        <div className="t-eyebrow" style={{ color: 'var(--accent-cool)' }}>
          No data yet
        </div>
        <p className="t-body" style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 'var(--space-2)' }}>
          The heatmap fills in as the worker computes each grid point. Point this
          page at a running worker with{' '}
          <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>?src=</code>, e.g.{' '}
          <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
            /map?src=http://your-server:8088/heatmap.json
          </code>
          , or set <code style={{ fontFamily: 'var(--font-mono)' }}>NEXT_PUBLIC_HEATMAP_URL</code>.
        </p>
        <p className="t-mono-data" style={{ color: 'var(--text-tertiary)', fontSize: 11, marginTop: 'var(--space-3)' }}>
          source: {url}
          {error ? ` · ${error}` : ''}
        </p>
      </div>
    </div>
  );
}

const FALLBACK_META = {
  bbox: { south: 49.8, north: 61.1, west: -8.7, east: 2.0 },
  spacingKm: 25,
  latStepDeg: 0.2246,
  lngStepDeg: 0.3835,
  hubHeightM: 100,
  total: 0,
  done: 0,
  failed: 0,
  complete: false,
  updatedAt: '1970-01-01T00:00:00.000Z',
};
