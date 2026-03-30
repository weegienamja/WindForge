import type { ReactNode } from 'react';
import React, { useState, useCallback } from 'react';
import { MapContainer, TileLayer, Polygon, CircleMarker, Tooltip as MapTooltip, useMapEvents } from 'react-leaflet';
import type { LatLng, SiteBoundary } from '@jamieblair/wind-site-intelligence-core';
import { createBoundary, parseBoundaryFromGeoJSON, parseBoundaryFromKML } from '@jamieblair/wind-site-intelligence-core';
import type { WindSiteTheme } from '../styles/theme.js';

export interface SiteBoundaryEditorProps {
  onBoundaryChange: (boundary: SiteBoundary | null) => void;
  initialBoundary?: SiteBoundary | null;
  /** Initial map center. Defaults to UK center. */
  mapCenter?: LatLng;
  /** Initial map zoom. Defaults to 6. */
  mapZoom?: number;
  className?: string;
  theme?: Partial<WindSiteTheme>;
}

/** Inner component that handles click events to add boundary points on the map. */
function MapClickHandler({ onMapClick }: { onMapClick: (coord: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}



export function SiteBoundaryEditor({
  onBoundaryChange,
  initialBoundary,
  mapCenter,
  mapZoom,
  className,
}: SiteBoundaryEditorProps): ReactNode {
  const [points, setPoints] = useState<LatLng[]>(initialBoundary?.polygon ?? []);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(initialBoundary?.name ?? '');
  const [drawingEnabled, setDrawingEnabled] = useState(true);

  const center = mapCenter ?? initialBoundary?.centroid ?? { lat: 55.0, lng: -3.5 };
  const zoom = mapZoom ?? 6;

  const updateBoundary = useCallback(
    (polygon: LatLng[], siteName: string) => {
      if (polygon.length < 3) {
        onBoundaryChange(null);
        return;
      }
      const boundary = createBoundary(polygon, siteName || undefined);
      onBoundaryChange(boundary);
    },
    [onBoundaryChange],
  );

  const handleMapClick = useCallback(
    (coord: LatLng) => {
      if (!drawingEnabled) return;
      setError(null);
      const newPoints = [...points, coord];
      setPoints(newPoints);
      updateBoundary(newPoints, name);
    },
    [points, name, updateBoundary, drawingEnabled],
  );

  const handleAddPoint = useCallback(() => {
    const latStr = (document.getElementById('wsi-lat-input') as HTMLInputElement)?.value;
    const lngStr = (document.getElementById('wsi-lng-input') as HTMLInputElement)?.value;
    const lat = Number.parseFloat(latStr ?? '');
    const lng = Number.parseFloat(lngStr ?? '');

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setError('Invalid coordinates. Lat must be -90 to 90, Lng must be -180 to 180.');
      return;
    }

    setError(null);
    const newPoints = [...points, { lat, lng }];
    setPoints(newPoints);
    updateBoundary(newPoints, name);
  }, [points, name, updateBoundary]);

  const handleRemovePoint = useCallback(
    (index: number) => {
      const newPoints = points.filter((_, i) => i !== index);
      setPoints(newPoints);
      updateBoundary(newPoints, name);
    },
    [points, name, updateBoundary],
  );

  const handleUndoLastPoint = useCallback(() => {
    if (points.length === 0) return;
    const newPoints = points.slice(0, -1);
    setPoints(newPoints);
    updateBoundary(newPoints, name);
  }, [points, name, updateBoundary]);

  const handleClear = useCallback(() => {
    setPoints([]);
    setError(null);
    setDrawingEnabled(true);
    onBoundaryChange(null);
  }, [onBoundaryChange]);

  const handleFileUpload = useCallback(
    (event: Event) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        if (!content) return;

        let result;
        if (file.name.endsWith('.geojson') || file.name.endsWith('.json')) {
          result = parseBoundaryFromGeoJSON(content);
        } else if (file.name.endsWith('.kml')) {
          result = parseBoundaryFromKML(content);
        } else {
          setError('Unsupported file format. Use .geojson, .json, or .kml');
          return;
        }

        if (result.ok) {
          setPoints(result.value.polygon);
          setName(result.value.name || name);
          setError(null);
          onBoundaryChange(result.value);
        } else {
          setError(result.error.message);
        }
      };
      reader.readAsText(file);
    },
    [name, onBoundaryChange],
  );

  const handleNameChange = useCallback(
    (event: Event) => {
      const newName = (event.target as HTMLInputElement).value;
      setName(newName);
      if (points.length >= 3) {
        updateBoundary(points, newName);
      }
    },
    [points, updateBoundary],
  );

  const inputStyle = {
    padding: '6px 10px',
    border: '1px solid var(--wsi-border, #e2e8f0)',
    borderRadius: '4px',
    fontSize: '13px',
    width: '100px',
  };

  const btnStyle = {
    padding: '6px 12px',
    border: '1px solid var(--wsi-border, #e2e8f0)',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    backgroundColor: 'var(--wsi-primary, #2563eb)',
    color: '#fff',
  };

  return React.createElement(
    'div',
    {
      className,
      style: {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        border: '1px solid var(--wsi-border, #e2e8f0)',
        borderRadius: '8px',
        padding: '16px',
        backgroundColor: 'var(--wsi-surface, #f8fafc)',
      },
      role: 'region',
      'aria-label': 'Site boundary editor',
    },
    // Title
    React.createElement('h3', { style: { margin: '0 0 12px', fontSize: '16px', fontWeight: 600 } }, 'Site Boundary'),

    // Name input
    React.createElement(
      'div',
      { style: { marginBottom: '12px' } },
      React.createElement('label', { style: { fontSize: '13px', marginRight: '8px' } }, 'Site name:'),
      React.createElement('input', {
        type: 'text',
        value: name,
        onChange: handleNameChange,
        placeholder: 'Enter site name',
        style: { ...inputStyle, width: '200px' },
      }),
    ),

    // Interactive map for drawing boundary
    React.createElement(
      'div',
      { style: { marginBottom: '12px' } },
      React.createElement(
        'div',
        {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '6px',
          },
        },
        React.createElement(
          'span',
          { style: { fontSize: '13px', fontWeight: 600, color: '#334155' } },
          'Click on the map to draw your site boundary',
        ),
        React.createElement(
          'div',
          { style: { display: 'flex', gap: '6px' } },
          React.createElement(
            'button',
            {
              onClick: handleUndoLastPoint,
              type: 'button',
              disabled: points.length === 0,
              style: {
                ...btnStyle,
                backgroundColor: points.length === 0 ? '#94a3b8' : '#f59e0b',
                cursor: points.length === 0 ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                padding: '4px 10px',
              },
            },
            'Undo',
          ),
          React.createElement(
            'button',
            {
              onClick: handleClear,
              type: 'button',
              disabled: points.length === 0,
              style: {
                ...btnStyle,
                backgroundColor: points.length === 0 ? '#94a3b8' : '#dc2626',
                cursor: points.length === 0 ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                padding: '4px 10px',
              },
            },
            'Clear',
          ),
        ),
      ),
      React.createElement(
        'div',
        {
          style: {
            height: '400px',
            borderRadius: '8px',
            overflow: 'hidden',
            border: '2px solid ' + (drawingEnabled ? '#22c55e' : '#e2e8f0'),
            position: 'relative',
            cursor: drawingEnabled ? 'crosshair' : 'default',
          },
        },
        React.createElement(
          MapContainer,
          {
            center: [center.lat, center.lng],
            zoom,
            style: { height: '100%', width: '100%' },
            attributionControl: false,
          },
          React.createElement(TileLayer, {
            url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          }),
          React.createElement(MapClickHandler, { onMapClick: handleMapClick }),
          // Draw the polygon if we have 3+ points
          points.length >= 3
            ? React.createElement(Polygon, {
                positions: points.map((p) => [p.lat, p.lng] as [number, number]),
                pathOptions: {
                  color: '#2563eb',
                  fillColor: '#2563eb',
                  fillOpacity: 0.15,
                  weight: 2,
                },
              })
            : null,
          // Draw vertex markers for each point
          ...points.map((p, i) =>
            React.createElement(
              CircleMarker,
              {
                key: `pt-${i}-${p.lat}-${p.lng}`,
                center: [p.lat, p.lng],
                radius: 6,
                pathOptions: {
                  color: '#fff',
                  fillColor: i === 0 ? '#22c55e' : '#2563eb',
                  fillOpacity: 1,
                  weight: 2,
                },
              },
              React.createElement(
                MapTooltip,
                { permanent: false },
                `Point ${i + 1}: ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`,
              ),
            ),
          ),
        ),
      ),
      // Instruction text below map
      React.createElement(
        'div',
        {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '4px',
            fontSize: '12px',
            color: '#64748b',
          },
        },
        React.createElement(
          'span',
          null,
          points.length < 3
            ? `${points.length} point${points.length === 1 ? '' : 's'} placed. Need at least 3 to form a boundary.`
            : `${points.length} points. Boundary defined.`,
        ),
        points.length >= 3
          ? React.createElement(
              'span',
              { style: { color: '#22c55e', fontWeight: 600 } },
              '\u2713 Boundary ready',
            )
          : null,
      ),
    ),

    // Manual coordinate input (collapsed, alternative to map)
    React.createElement(
      'details',
      { style: { marginBottom: '12px' } },
      React.createElement(
        'summary',
        {
          style: {
            fontSize: '13px',
            color: '#64748b',
            cursor: 'pointer',
            userSelect: 'none',
          },
        },
        'Or enter coordinates manually / upload file',
      ),
      React.createElement(
        'div',
        { style: { marginTop: '8px' } },
        // Coordinate inputs
        React.createElement(
          'div',
          { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' } },
          React.createElement('input', { id: 'wsi-lat-input', type: 'number', step: '0.0001', placeholder: 'Latitude', style: inputStyle }),
          React.createElement('input', { id: 'wsi-lng-input', type: 'number', step: '0.0001', placeholder: 'Longitude', style: inputStyle }),
          React.createElement('button', { onClick: handleAddPoint, type: 'button', style: btnStyle }, 'Add Point'),
        ),
        // File upload
        React.createElement(
          'div',
          { style: { marginBottom: '8px' } },
          React.createElement('label', { style: { fontSize: '13px', marginRight: '8px' } }, 'Upload boundary file:'),
          React.createElement('input', {
            type: 'file',
            accept: '.geojson,.json,.kml',
            onChange: handleFileUpload,
            style: { fontSize: '13px' },
          }),
        ),
      ),
    ),

    // Error
    error
      ? React.createElement('div', { style: { color: '#dc2626', fontSize: '13px', marginBottom: '8px' }, role: 'alert' }, error)
      : null,

    // Point list
    points.length > 0
      ? React.createElement(
          'div',
          { style: { marginTop: '8px' } },
          React.createElement('div', { style: { fontSize: '13px', fontWeight: 600, marginBottom: '4px' } }, `${points.length} points defined`),
          React.createElement(
            'div',
            { style: { maxHeight: '150px', overflowY: 'auto', fontSize: '12px' } },
            ...points.map((p, i) =>
              React.createElement(
                'div',
                {
                  key: i,
                  style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '2px 0' },
                },
                React.createElement('span', null, `${i + 1}. ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`),
                React.createElement(
                  'button',
                  {
                    onClick: () => handleRemovePoint(i),
                    type: 'button',
                    style: {
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      color: '#dc2626',
                      fontSize: '14px',
                    },
                    'aria-label': `Remove point ${i + 1}`,
                  },
                  '\u00d7',
                ),
              ),
            ),
          ),
        )
      : null,
  );
}
