'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { LatLng } from '@jamieblair/windforge-core';
import atlas from '../../../public/gwa/uk-wind-100m.json';
import { scoreColor } from '../../lib/heatmap';
import type { MapPreset } from './LeafletMap';
import { ScaleLegend } from '../primitives/ScaleLegend';

const LeafletMap = dynamic(() => import('./LeafletMap').then((m) => m.LeafletMap), {
  ssr: false,
  loading: () => (
    <p className="wf-map-status" role="status">
      Loading map…
    </p>
  ),
});

export type MapPanelProps = {
  coordinate: LatLng | null;
  loading: boolean;
  minHeight?: number;
  onPick?: (coordinate: LatLng) => void;
  presets?: MapPreset[];
};

export function MapPanel({
  coordinate,
  loading,
  minHeight = 480,
  onPick,
  presets = [],
}: MapPanelProps) {
  const [showAtlas, setShowAtlas] = useState(false);
  return (
    <div className="wf-site-map" style={{ minHeight }}>
      <LeafletMap coordinate={coordinate} onPick={onPick} presets={presets} showAtlas={showAtlas} />
      <div className="wf-map-control">
        <label>
          <input
            type="checkbox"
            checked={showAtlas}
            onChange={(e) => setShowAtlas(e.target.checked)}
          />{' '}
          UK wind atlas
        </label>
        {showAtlas && (
          <ScaleLegend
            min={atlas.stretchLoMs}
            max={atlas.stretchHiMs}
            colors={[0, 25, 50, 75, 100].map(scoreColor)}
            unit="m/s"
            label={'Mean wind at ' + atlas.heightM + ' m'}
          />
        )}
      </div>
      {loading && (
        <p data-testid="map-loading-overlay" className="wf-map-status" role="status">
          Retrieving site evidence…
        </p>
      )}
    </div>
  );
}
