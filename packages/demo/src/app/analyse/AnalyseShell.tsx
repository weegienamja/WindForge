'use client';

import dynamic from 'next/dynamic';

/**
 * Client-only wrapper around the analyse page implementation. Leaflet (loaded
 * deeply inside `AnalyseClient`) references `window` at module scope, so the
 * route cannot be prerendered. Splitting it out behind `dynamic({ ssr: false })`
 * keeps the leaflet bundle out of the server build entirely.
 */
const AnalyseClient = dynamic(
  () => import('./AnalyseClient').then((m) => m.AnalyseClient),
  { ssr: false },
);

export function AnalyseShell() {
  return <AnalyseClient />;
}
