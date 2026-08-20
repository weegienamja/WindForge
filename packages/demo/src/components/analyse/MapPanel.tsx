'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { LatLng } from '@jamieblair/windforge-core';
import { ParticleField } from '../primitives/ParticleField';
import { ScaleLegend } from '../primitives/ScaleLegend';
import type { MapPreset } from './LeafletMap';

const LeafletMap = dynamic(() => import('./LeafletMap').then((m) => m.LeafletMap), {
  ssr: false,
  loading: () => (
    <div
      data-testid="map-skeleton"
      className="t-mono-data"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-secondary)',
        background: 'var(--surface-1)',
      }}
    >
      Loading map…
    </div>
  ),
});

export type MapLayerKey =
  | 'wind'
  | 'terrain'
  | 'grid'
  | 'constraints'
  | 'exclusion';

const LAYER_LABELS: Record<MapLayerKey, string> = {
  wind: 'Wind resource',
  terrain: 'Terrain',
  grid: 'Grid infrastructure',
  constraints: 'Constraints',
  exclusion: 'Exclusion zones',
};

export type MapPanelProps = {
  coordinate: LatLng | null;
  loading: boolean;
  /** Minimum panel height in px. Smaller on mobile to keep the map glanceable. */
  minHeight?: number;
  /** Called when the user clicks the map to choose a new analysis point. */
  onPick?: (coordinate: LatLng) => void;
  /** Clickable preset locations shown as pins before a point is chosen. */
  presets?: MapPreset[];
};

const STATUS_LINES = [
  'Fetching NASA POWER…',
  'Reconciling against CERRA…',
  'Querying Overpass…',
  'Sampling Open-Elevation…',
];

export function MapPanel({
  coordinate,
  loading,
  minHeight = 480,
  onPick,
  presets = [],
}: MapPanelProps) {
  const [layers, setLayers] = useState<Record<MapLayerKey, boolean>>({
    wind: true,
    terrain: false,
    grid: false,
    constraints: true,
    exclusion: false,
  });

  const toggle = (k: MapLayerKey) =>
    setLayers((prev) => ({ ...prev, [k]: !prev[k] }));

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight,
        border: '1px solid var(--border-subtle)',
        borderRadius: 4,
        overflow: 'hidden',
        background: 'var(--surface-1)',
      }}
    >
      {/* Particle field as backing visual: landing → analyse continuity */}
      <div
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, opacity: 0.6, zIndex: 0 }}
      >
        <ParticleField ariaLabel="Animated wind field background" />
      </div>

      {/* Map layer — always rendered so users can pan/click before picking a point */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
        <LeafletMap coordinate={coordinate} onPick={onPick} presets={presets} />
      </div>

      {/* Click-to-place hint */}
      {coordinate && onPick ? (
        <div
          style={{
            position: 'absolute',
            bottom: 'var(--space-3)',
            left: 'var(--space-3)',
            zIndex: 3,
            background: 'var(--surface-1)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
            padding: '4px 8px',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            pointerEvents: 'none',
          }}
        >
          Click the map to move the analysis point
        </div>
      ) : null}

      {/* Wind-resource scale legend */}
      {layers.wind && coordinate ? (
        <div
          style={{
            position: 'absolute',
            top: 'var(--space-3)',
            left: 'var(--space-3)',
            zIndex: 3,
            background: 'var(--surface-1)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
            padding: 'var(--space-2) var(--space-3)',
          }}
        >
          <ScaleLegend
            min={0}
            max={12}
            unit="m/s"
            label="Wind speed"
            colors={['#1a2238', '#4a7ab8', '#6ba9ff', '#f5b942']}
          />
        </div>
      ) : null}

      {/* Layer toggles */}
      <fieldset
        data-testid="layer-toggles"
        style={{
          position: 'absolute',
          top: 'var(--space-3)',
          right: 'var(--space-3)',
          zIndex: 3,
          background: 'var(--surface-1)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 4,
          padding: 'var(--space-3)',
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <legend className="t-eyebrow" style={{ padding: '0 4px' }}>
          Layers
        </legend>
        {(Object.keys(LAYER_LABELS) as MapLayerKey[]).map((k) => (
          <label
            key={k}
            className="t-mono-data"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              cursor: 'pointer',
              color: 'var(--text-secondary)',
            }}
          >
            <input
              type="checkbox"
              checked={layers[k]}
              onChange={() => toggle(k)}
              data-layer={k}
            />
            {LAYER_LABELS[k]}
          </label>
        ))}
      </fieldset>

      {/* Loading shimmer */}
      {loading ? (
        <div
          data-testid="map-loading-overlay"
          aria-live="polite"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(10,14,26,0.6)',
            backdropFilter: 'blur(2px)',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              alignItems: 'center',
              color: 'var(--text-primary)',
            }}
          >
            <div className="t-eyebrow" style={{ color: 'var(--accent-cool)' }}>
              Analysing
            </div>
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                alignItems: 'center',
              }}
            >
              {STATUS_LINES.map((line) => (
                <li
                  key={line}
                  className="t-mono-data"
                  style={{ color: 'var(--text-secondary)', fontSize: 12 }}
                >
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
