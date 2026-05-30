'use client';

import dynamic from 'next/dynamic';

// Leaflet touches `window` at module scope, so the heatmap UI is client-only.
const HeatmapClient = dynamic(
  () => import('./HeatmapClient').then((m) => m.HeatmapClient),
  { ssr: false },
);

export default function MapPage() {
  return <HeatmapClient />;
}
