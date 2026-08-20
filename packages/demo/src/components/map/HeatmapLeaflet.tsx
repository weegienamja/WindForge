'use client';

import { MapContainer, Rectangle, TileLayer, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { scoreColor, type HeatmapCell, type HeatmapMeta } from '../../lib/heatmap';

export interface HeatmapLeafletProps {
  cells: HeatmapCell[];
  meta: HeatmapMeta;
  onPick?: (cell: HeatmapCell) => void;
}

/**
 * Renders the suitability grid as coloured rectangles over a dark basemap.
 * Canvas rendering (`preferCanvas`) keeps thousands of cells smooth.
 */
export function HeatmapLeaflet({ cells, meta, onPick }: HeatmapLeafletProps) {
  const halfLat = meta.latStepDeg / 2;
  const halfLng = meta.lngStepDeg / 2;

  return (
    <MapContainer
      center={[54.6, -3.2]}
      zoom={5}
      minZoom={4}
      preferCanvas
      style={{ width: '100%', height: '100%', background: 'transparent' }}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        opacity={0.85}
      />
      {cells.map((cell) => {
        if (cell.score === null || cell.score === undefined) return null;
        const bounds: [[number, number], [number, number]] = [
          [cell.lat - halfLat, cell.lng - halfLng],
          [cell.lat + halfLat, cell.lng + halfLng],
        ];
        return (
          <Rectangle
            key={`${cell.lat},${cell.lng}`}
            bounds={bounds}
            pathOptions={{
              stroke: false,
              fillColor: scoreColor(cell.score),
              fillOpacity: 0.62,
            }}
            eventHandlers={onPick ? { click: () => onPick(cell) } : undefined}
          >
            <Tooltip direction="top" opacity={1}>
              <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
                <strong>Score {cell.score}</strong>
                {typeof cell.windSpeedMs === 'number' ? <> · {cell.windSpeedMs.toFixed(1)} m/s</> : null}
                {cell.hardConstraints ? <> · {cell.hardConstraints} hard limit{cell.hardConstraints === 1 ? '' : 's'}</> : null}
                <br />
                {cell.lat.toFixed(3)}, {cell.lng.toFixed(3)}
              </div>
            </Tooltip>
          </Rectangle>
        );
      })}
    </MapContainer>
  );
}
