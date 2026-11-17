'use client';
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import {
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  CircleMarker,
  TileLayer,
  ScaleControl,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import type { LatLng } from '@jamieblair/windforge-core';
import type { Layout, Project } from '../../lib/designer/project';
import 'leaflet/dist/leaflet.css';

export type Tool = 'select' | 'place' | 'receptor' | 'boundary';
type Props = {
  project: Project;
  layout: Layout;
  tool: Tool;
  selected: number | null;
  draft: LatLng[];
  frame: number;
  onPick: (p: LatLng) => void;
  onSelect: (i: number) => void;
  onMove: (i: number, p: LatLng) => void;
  onReceptor: (p: LatLng) => void;
};
const rotor =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><path d="M11.3 11.2 11 .9q.1-1 1 .1l2 7.7-1.1 2.7z"/><path d="M11.3 11.2 11 .9q.1-1 1 .1l2 7.7-1.1 2.7z" transform="rotate(120 12 12)"/><path d="M11.3 11.2 11 .9q.1-1 1 .1l2 7.7-1.1 2.7z" transform="rotate(240 12 12)"/><circle cx="12" cy="12" r="1.8"/></g></svg>';
const towerIcon = (idx: number, selected: boolean) =>
  L.divIcon({
    className: 'farm-marker' + (selected ? ' selected' : ''),
    html: rotor + '<span>T' + (idx + 1) + '</span>',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
const receptorIcon = L.divIcon({
  className: 'farm-receptor',
  html: 'R',
  iconSize: [23, 23],
  iconAnchor: [11, 11],
});
function Frame({
  frame,
  boundary,
  receptor,
  positions,
}: Pick<Props, 'frame'> & { boundary: LatLng[]; receptor: LatLng | null; positions: LatLng[] }) {
  const map = useMap();
  const overlays = useRef({ receptor, positions });
  useEffect(() => {
    overlays.current = { receptor, positions };
  }, [receptor, positions]);
  // Fitting is explicit so dragging a marker or the receptor never moves the user's viewport.
  useEffect(() => {
    const bounds = L.latLngBounds(boundary);
    const { positions, receptor } = overlays.current;
    if (receptor) bounds.extend(receptor);
    for (const t of positions) bounds.extend(t);
    map.fitBounds(bounds, { padding: [32, 36], maxZoom: 16, animate: false });
  }, [map, frame, boundary]);
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}
function Clicks({ onPick }: Pick<Props, 'onPick'>) {
  useMapEvents({ click: (e) => onPick(e.latlng) });
  return null;
}
export default function FarmMap(p: Props) {
  const locked = p.tool !== 'select';
  return (
    <MapContainer
      center={p.project.site}
      zoom={13}
      scrollWheelZoom={false}
      className={'farm-map tool-' + p.tool}
      attributionControl
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />
      <Frame
        frame={p.frame}
        boundary={p.project.boundary}
        receptor={p.project.receptor}
        positions={p.layout.positions}
      />
      <ScaleControl imperial={false} position="bottomleft" />
      <Clicks onPick={p.onPick} />
      <Polygon
        positions={p.project.boundary}
        interactive={false}
        pathOptions={{
          stroke: true,
          color: '#146753',
          opacity: p.tool === 'boundary' ? 0.3 : 1,
          weight: 2.5,
          dashArray: '7 5',
          fillColor: '#5fa273',
          fillOpacity: 0.16,
        }}
      />
      {p.project.screen?.zones.map((zone, i) => (
        <Polygon
          key={i}
          positions={[zone.polygon, ...(zone.holes ?? [])]}
          interactive={false}
          pathOptions={{ color: '#a7502d', weight: 1, fillColor: '#ba623a', fillOpacity: 0.25 }}
        />
      ))}
      {p.draft.length > 0 && (
        <Polyline
          positions={p.draft}
          interactive={false}
          pathOptions={{ color: '#935013', weight: 3 }}
        />
      )}
      {p.draft.map((v, i) => (
        <CircleMarker
          key={i}
          center={v}
          radius={4}
          interactive={false}
          pathOptions={{ color: '#844406', fillColor: '#fff', fillOpacity: 1 }}
        />
      ))}
      {p.layout.positions.map((v, i) => (
        <Marker
          key={i + String(locked)}
          title={'Turbine ' + (i + 1)}
          alt={'Turbine ' + (i + 1)}
          position={v}
          icon={towerIcon(i, p.selected === i)}
          draggable={!locked}
          interactive={!locked}
          keyboard={!locked}
          eventHandlers={{
            click: () => p.onSelect(i),
            dragend: (e) => p.onMove(i, e.target.getLatLng()),
          }}
        />
      ))}
      {p.project.receptor && (
        <Marker
          key={String(locked)}
          position={p.project.receptor}
          title="Shared receptor"
          alt="Shared receptor"
          icon={receptorIcon}
          draggable={!locked}
          interactive={!locked}
          keyboard={!locked}
          eventHandlers={{ dragend: (e) => p.onReceptor(e.target.getLatLng()) }}
        />
      )}
    </MapContainer>
  );
}
