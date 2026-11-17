'use client';

import { useEffect } from 'react';
import {
  CircleMarker,
  MapContainer,
  ImageOverlay,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import atlas from '../../../public/gwa/uk-wind-100m.json';
import type { LatLng } from '@jamieblair/windforge-core';

// Fix default Leaflet marker assets when bundled by Next. Served locally from
// /public/leaflet so the map renders without a third-party CDN dependency.
const icon = L.icon({
  iconUrl: '/leaflet/marker-icon.png',
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  shadowUrl: '/leaflet/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export interface MapPreset {
  name: string;
  lat: number;
  lng: number;
}

export type LeafletMapProps = {
  /** Active analysis point, if any. */
  coordinate: LatLng | null;
  showAtlas?: boolean;
  /** Called when the user clicks the map (or a preset pin) to pick a point. */
  onPick?: (coordinate: LatLng) => void;
  /** Clickable preset locations shown as pins when there is no active point. */
  presets?: MapPreset[];
  /** Initial centre when no coordinate is set. Defaults to a world view. */
  defaultCenter?: [number, number];
  defaultZoom?: number;
};

/** Headless child that wires map click events to the `onPick` callback. */
function ClickToPick({ onPick }: { onPick?: (coordinate: LatLng) => void }) {
  useMapEvents({
    click(event) {
      const point = event.latlng.wrap();
      onPick?.({ lat: point.lat, lng: point.lng });
    },
  });
  return null;
}

/**
 * Keeps Leaflet's internal size in sync with its container. Without this the
 * map only paints tiles for the size it had at mount, leaving blank areas if
 * the panel later grows (e.g. responsive layout or sticky-height changes).
 */
function ResizeHandler() {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const el = map.getContainer();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(el);
    return () => observer.disconnect();
  }, [map]);
  return null;
}

/** Flies the map to the active coordinate whenever it changes. */
function Recenter({ coordinate }: { coordinate: LatLng | null }) {
  const map = useMap();
  const lat = coordinate?.lat,
    lng = coordinate?.lng;
  useEffect(() => {
    if (lat === undefined || lng === undefined) return;
    const zoom = Math.max(map.getZoom(), 9);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      map.setView([lat, lng], zoom, { animate: false });
    else map.flyTo([lat, lng], zoom, { duration: 0.6 });
  }, [lat, lng, map]);
  return null;
}

export function LeafletMap({
  coordinate,
  onPick,
  presets = [],
  showAtlas = false,
  defaultCenter = [55.3, -3.8],
  defaultZoom = 5,
}: LeafletMapProps) {
  const center: [number, number] = coordinate ? [coordinate.lat, coordinate.lng] : defaultCenter;
  const zoom = coordinate ? 9 : defaultZoom;

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      minZoom={2}
      worldCopyJump
      style={{
        width: '100%',
        height: '100%',
        background: 'transparent',
        cursor: onPick ? 'crosshair' : undefined,
      }}
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
        opacity={0.85}
      />
      {showAtlas && (
        <ImageOverlay
          url="/gwa/uk-wind-100m.png"
          bounds={atlas.bounds as [[number, number], [number, number]]}
          opacity={0.72}
          attribution='Wind resource: <a href="https://globalwindatlas.info/">Global Wind Atlas</a> (DTU/World Bank)'
        />
      )}
      {onPick ? <ClickToPick onPick={onPick} /> : null}
      <ResizeHandler />
      <Recenter coordinate={coordinate} />

      {/* Preset quick-pick pins — shown until the user picks their own point. */}
      {!coordinate
        ? presets.map((p) => (
            <CircleMarker
              key={p.name}
              center={[p.lat, p.lng]}
              radius={7}
              bubblingMouseEvents={false}
              pathOptions={{
                color: '#074e47',
                fillColor: '#9de7c4',
                fillOpacity: 0.6,
                weight: 2,
              }}
              eventHandlers={{
                click: () => onPick?.({ lat: p.lat, lng: p.lng }),
              }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                {p.name}
              </Tooltip>
            </CircleMarker>
          ))
        : null}

      {coordinate ? (
        <Marker position={[coordinate.lat, coordinate.lng]} icon={icon}>
          <Popup>
            {coordinate.lat.toFixed(4)}, {coordinate.lng.toFixed(4)}
          </Popup>
        </Marker>
      ) : null}
    </MapContainer>
  );
}
