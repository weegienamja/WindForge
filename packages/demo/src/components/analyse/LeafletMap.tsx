'use client';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
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

export type LeafletMapProps = {
  coordinate: LatLng;
};

export function LeafletMap({ coordinate }: LeafletMapProps) {
  return (
    <MapContainer
      center={[coordinate.lat, coordinate.lng]}
      zoom={9}
      style={{ width: '100%', height: '100%', background: 'transparent' }}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        opacity={0.6}
      />
      <Marker position={[coordinate.lat, coordinate.lng]} icon={icon}>
        <Popup>
          {coordinate.lat.toFixed(4)}, {coordinate.lng.toFixed(4)}
        </Popup>
      </Marker>
    </MapContainer>
  );
}
