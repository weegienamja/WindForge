'use client';

import { ImageOverlay, MapContainer, Rectangle, TileLayer, Tooltip, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { scoreColor, type HeatmapCell, type HeatmapMeta } from '../../lib/heatmap';

export interface GwaOverlay {
  url: string;
  bounds: [[number, number], [number, number]];
  opacity?: number;
}

export interface HeatmapLeafletProps {
  cells: HeatmapCell[];
  meta: HeatmapMeta;
  onPick?: (cell: HeatmapCell) => void;
  /** Cell → fill colour. Defaults to the absolute suitability ramp. */
  colorFor?: (cell: HeatmapCell) => string;
  /** Fine-resolution Global Wind Atlas raster overlay (drawn above the basemap). */
  gwa?: GwaOverlay | null;
  /** Click handler for the raster layer (no discrete cells to click). */
  onMapPick?: (lat: number, lng: number) => void;
}

/** Routes raster-layer map clicks to `onMapPick`. */
function MapClick({ onMapPick }: { onMapPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onMapPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

/**
 * Renders the suitability grid as coloured rectangles over a dark basemap, and/or
 * a fine Global Wind Atlas raster overlay. Canvas rendering keeps cells smooth.
 */
export function HeatmapLeaflet({ cells, meta, onPick, colorFor, gwa, onMapPick }: HeatmapLeafletProps) {
  const halfLat = meta.latStepDeg / 2;
  const halfLng = meta.lngStepDeg / 2;
  const fill = colorFor ?? ((c: HeatmapCell) => scoreColor(c.score ?? 0));

  return (
    <MapContainer
      center={[54.6, -3.2]}
      zoom={5}
      minZoom={4}
      preferCanvas
      style={{
        width: '100%',
        height: '100%',
        background: 'transparent',
        cursor: gwa && onMapPick ? 'crosshair' : undefined,
      }}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        opacity={0.85}
      />

      {gwa ? (
        <ImageOverlay url={gwa.url} bounds={gwa.bounds} opacity={gwa.opacity ?? 0.8} />
      ) : null}
      {gwa && onMapPick ? <MapClick onMapPick={onMapPick} /> : null}

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
              fillColor: fill(cell),
              fillOpacity: 0.66,
            }}
            eventHandlers={onPick ? { click: () => onPick(cell) } : undefined}
          >
            <Tooltip direction="top" opacity={1}>
              <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
                <strong>Score {cell.score}</strong>
                {cell.offshore ? <> · offshore</> : null}
                {typeof cell.windSpeedMs === 'number' ? <> · {cell.windSpeedMs.toFixed(1)} m/s</> : null}
                {typeof cell.lcoePerMwh === 'number' ? (
                  <>
                    {' '}
                    · £{cell.lcoePerMwh}/MWh{cell.subsidyFree ? ' (subsidy-free)' : ''}
                  </>
                ) : null}
                {typeof cell.capacityFactor === 'number' ? <> · CF {(cell.capacityFactor * 100).toFixed(0)}%</> : null}
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
