import type { ReactNode } from 'react';
import React, { useRef, useState, useCallback, useEffect } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, CircleMarker, Tooltip as MapTooltip } from 'react-leaflet';
import type { LatLng } from '@jamieblair/windforge-core';
import type { MapPin } from '../hooks/use-map-interaction.js';
import type { WindSiteTheme } from '../styles/theme.js';

/** A single heatmap grid point with a suitability score */
export interface HeatmapPoint {
  coordinate: LatLng;
  score: number; // 0-100
}

// Fix default marker icon path issue with bundlers
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const LoadingIcon = L.divIcon({
  className: 'wsi-loading-marker',
  html: '<div style="width:25px;height:41px;display:flex;align-items:center;justify-content:center"><div class="wsi-pulse" style="width:16px;height:16px;border-radius:50%;background:#22c55e;animation:wsi-pulse 1.2s ease-in-out infinite"></div></div>',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

interface SiteMapProps {
  center: LatLng;
  zoom?: number;
  pin?: MapPin | null;
  onMapClick: (coord: LatLng) => void;
  popupContent?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Optional theme overrides. */
  theme?: Partial<WindSiteTheme>;
  /** Heatmap grid points to overlay on the map. Pass undefined or empty to hide. */
  heatmapPoints?: HeatmapPoint[];
  /** Show/hide the heatmap overlay. Defaults to true when heatmapPoints are provided. */
  showHeatmap?: boolean;
  /** Called when the visible map bounds change (debounced). Returns the bounds for pre-calculating heatmap scores. */
  onBoundsChange?: (bounds: { south: number; west: number; north: number; east: number }) => void;
}

function ClickHandler({ onClick }: { onClick: (coord: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function BoundsWatcher({ onBoundsChange }: { onBoundsChange: (bounds: { south: number; west: number; north: number; east: number }) => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emitBounds = useCallback((map: LeafletMap) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const b = map.getBounds();
      onBoundsChange({
        south: b.getSouth(),
        west: b.getWest(),
        north: b.getNorth(),
        east: b.getEast(),
      });
    }, 500);
  }, [onBoundsChange]);

  // Clear any pending debounce timer on unmount to avoid the callback firing
  // against a stale/unmounted map and to prevent the closure from retaining the map.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useMapEvents({
    moveend(e) { emitBounds(e.target as LeafletMap); },
    zoomend(e) { emitBounds(e.target as LeafletMap); },
    load(e) { emitBounds(e.target as LeafletMap); },
  });
  return null;
}

function heatmapColor(score: number): string {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#84cc16';
  if (score >= 40) return '#f59e0b';
  if (score >= 20) return '#f97316';
  return '#ef4444';
}

export function SiteMap({
  center,
  zoom = 8,
  pin,
  onMapClick,
  popupContent,
  className,
  style,
  heatmapPoints,
  showHeatmap = true,
  onBoundsChange,
  theme: _theme,
}: SiteMapProps): ReactNode {
  const mapRef = useRef<LeafletMap | null>(null);
  const [heatmapVisible, setHeatmapVisible] = useState(showHeatmap);

  useEffect(() => {
    setHeatmapVisible(showHeatmap);
  }, [showHeatmap]);

  const toggleHeatmap = useCallback(() => {
    setHeatmapVisible((v) => !v);
  }, []);

  const hasHeatmap = heatmapPoints && heatmapPoints.length > 0;

  return React.createElement(
    'div',
    {
      className,
      style: {
        position: 'relative' as const,
        ...style,
      },
    },
    React.createElement(
      'style',
      null,
      `@keyframes wsi-pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.4); opacity: 0.6; }
      }`,
    ),
    // Heatmap toggle button
    hasHeatmap &&
      React.createElement(
        'button',
        {
          onClick: toggleHeatmap,
          style: {
            position: 'absolute' as const,
            top: 10,
            right: 10,
            zIndex: 1000,
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid #ccc',
            backgroundColor: heatmapVisible ? '#0f172a' : '#fff',
            color: heatmapVisible ? '#fff' : '#0f172a',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          },
          'aria-label': heatmapVisible ? 'Hide suitability heatmap' : 'Show suitability heatmap',
        },
        heatmapVisible ? 'Hide Heatmap' : 'Show Heatmap',
      ),
    React.createElement(
      MapContainer,
      {
        center: [center.lat, center.lng],
        zoom,
        style: { height: '100%', width: '100%', borderRadius: '8px' },
        ref: mapRef,
        attributionControl: false,
      },
      React.createElement(TileLayer, {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      }),
      React.createElement(ClickHandler, { onClick: onMapClick }),
      onBoundsChange && React.createElement(BoundsWatcher, { onBoundsChange }),
      // Heatmap overlay
      heatmapVisible &&
        hasHeatmap &&
        heatmapPoints.map((pt) =>
          React.createElement(
            CircleMarker,
            {
              key: `hm-${pt.coordinate.lat}-${pt.coordinate.lng}`,
              center: [pt.coordinate.lat, pt.coordinate.lng],
              radius: 12,
              pathOptions: {
                fillColor: heatmapColor(pt.score),
                fillOpacity: 0.5,
                color: heatmapColor(pt.score),
                weight: 1,
                opacity: 0.7,
              },
            },
            React.createElement(
              MapTooltip,
              null,
              `Score: ${pt.score}/100`,
            ),
          ),
        ),
      pin &&
        React.createElement(
          Marker,
          {
            position: [pin.coordinate.lat, pin.coordinate.lng],
            icon: pin.loading ? LoadingIcon : DefaultIcon,
          },
          popupContent &&
            !pin.loading &&
            React.createElement(Popup, null, popupContent),
        ),
    ),
  );
}
