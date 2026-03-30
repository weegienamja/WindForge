import type { ReactNode } from 'react';
import React, { useState, useCallback } from 'react';
import type { LatLng, SiteBoundary } from '@jamieblair/wind-site-intelligence-core';
import { createBoundary, parseBoundaryFromGeoJSON, parseBoundaryFromKML } from '@jamieblair/wind-site-intelligence-core';
import type { WindSiteTheme } from '../styles/theme.js';

export interface SiteBoundaryEditorProps {
  onBoundaryChange: (boundary: SiteBoundary | null) => void;
  initialBoundary?: SiteBoundary | null;
  className?: string;
  theme?: Partial<WindSiteTheme>;
}

export function SiteBoundaryEditor({
  onBoundaryChange,
  initialBoundary,
  className,
}: SiteBoundaryEditorProps): ReactNode {
  const [points, setPoints] = useState<LatLng[]>(initialBoundary?.polygon ?? []);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(initialBoundary?.name ?? '');

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

  const handleClear = useCallback(() => {
    setPoints([]);
    setError(null);
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

    // Coordinate inputs
    React.createElement(
      'div',
      { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' } },
      React.createElement('input', { id: 'wsi-lat-input', type: 'number', step: '0.0001', placeholder: 'Latitude', style: inputStyle }),
      React.createElement('input', { id: 'wsi-lng-input', type: 'number', step: '0.0001', placeholder: 'Longitude', style: inputStyle }),
      React.createElement('button', { onClick: handleAddPoint, type: 'button', style: btnStyle }, 'Add Point'),
      React.createElement('button', { onClick: handleClear, type: 'button', style: { ...btnStyle, backgroundColor: '#dc2626' } }, 'Clear'),
    ),

    // File upload
    React.createElement(
      'div',
      { style: { marginBottom: '12px' } },
      React.createElement('label', { style: { fontSize: '13px', marginRight: '8px' } }, 'Or upload:'),
      React.createElement('input', {
        type: 'file',
        accept: '.geojson,.json,.kml',
        onChange: handleFileUpload,
        style: { fontSize: '13px' },
      }),
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
