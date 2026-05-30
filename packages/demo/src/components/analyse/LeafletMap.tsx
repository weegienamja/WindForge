'use client';

import { useEffect } from 'react';
import {
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
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
      onPick?.({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

/** Flies the map to the active coordinate whenever it changes. */
function Recenter({ coordinate }: { coordinate: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (coordinate) {
      map.flyTo([coordinate.lat, coordinate.lng], Math.max(map.getZoom(), 9), {
        duration: 0.6,
      });
    }
  }, [coordinate, map]);
  return null;
}

export function LeafletMap({
  coordinate,
  onPick,
  presets = [],
  defaultCenter = [30, 0],
  defaultZoom = 2,
}: LeafletMapProps) {
  const center: [number, number] = coordinate
    ? [coordinate.lat, coordinate.lng]
    : defaultCenter;
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
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        opacity={0.85}
      />
      {onPick ? <ClickToPick onPick={onPick} /> : null}
      <Recenter coordinate={coordinate} />

      {/* Preset quick-pick pins — shown until the user picks their own point. */}
      {!coordinate
        ? presets.map((p) => (
            <CircleMarker
              key={p.name}
              center={[p.lat, p.lng]}
              radius={7}
              pathOptions={{
                color: '#6ba9ff',
                fillColor: '#6ba9ff',
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
