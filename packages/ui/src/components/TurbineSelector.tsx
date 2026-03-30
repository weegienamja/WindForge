import type { ReactNode } from 'react';
import React from 'react';
import type {
  TurbineModel,
} from '@jamieblair/wind-site-intelligence-core';
import { getAllTurbines } from '@jamieblair/wind-site-intelligence-core';
import type { WindSiteTheme } from '../styles/theme.js';

export interface TurbineSelectorProps {
  selectedTurbineId: string | null;
  onSelect: (turbine: TurbineModel) => void;
  className?: string;
  theme?: Partial<WindSiteTheme>;
}

export function TurbineSelector({ selectedTurbineId, onSelect, className }: TurbineSelectorProps): ReactNode {
  const turbines = getAllTurbines();

  // Group by power class
  const small = turbines.filter((t) => t.ratedPowerKw < 1000);
  const medium = turbines.filter((t) => t.ratedPowerKw >= 1000 && t.ratedPowerKw < 3000);
  const large = turbines.filter((t) => t.ratedPowerKw >= 3000 && t.ratedPowerKw < 5000);
  const xlarge = turbines.filter((t) => t.ratedPowerKw >= 5000);

  const groups = [
    { label: 'Small (< 1 MW)', turbines: small },
    { label: 'Medium (1 - 3 MW)', turbines: medium },
    { label: 'Large (3 - 5 MW)', turbines: large },
    { label: 'Extra Large (5+ MW)', turbines: xlarge },
  ].filter((g) => g.turbines.length > 0);

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
      'aria-label': 'Turbine model selector',
    },
    React.createElement('h3', { style: { margin: '0 0 12px', fontSize: '16px', fontWeight: 600 } }, 'Select Turbine'),
    ...groups.map((group) =>
      React.createElement(
        'div',
        { key: group.label, style: { marginBottom: '16px' } },
        React.createElement(
          'div',
          { style: { fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' } },
          group.label,
        ),
        React.createElement(
          'div',
          { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } },
          ...group.turbines.map((turbine) => {
            const isSelected = turbine.id === selectedTurbineId;
            return React.createElement(
              'button',
              {
                key: turbine.id,
                type: 'button',
                onClick: () => onSelect(turbine),
                'aria-pressed': isSelected,
                style: {
                  padding: '8px 12px',
                  border: isSelected ? '2px solid var(--wsi-primary, #2563eb)' : '1px solid var(--wsi-border, #e2e8f0)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: isSelected ? '#eff6ff' : '#fff',
                  fontSize: '12px',
                  textAlign: 'left',
                  minWidth: '160px',
                },
              },
              React.createElement('div', { style: { fontWeight: 600, fontSize: '13px' } }, `${turbine.manufacturer} ${turbine.model}`),
              React.createElement(
                'div',
                { style: { color: '#64748b', marginTop: '2px' } },
                `${(turbine.ratedPowerKw / 1000).toFixed(1)} MW | \u00d8${turbine.rotorDiameterM}m`,
              ),
              React.createElement(
                'div',
                { style: { color: '#94a3b8', marginTop: '2px' } },
                `Hub: ${turbine.hubHeightOptionsM.join('/')}m`,
              ),
            );
          }),
        ),
      ),
    ),
  );
}
