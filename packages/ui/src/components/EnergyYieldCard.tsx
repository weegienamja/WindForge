import type { ReactNode } from 'react';
import React from 'react';
import type { EnergyYieldResult, LossStack, PScenario } from '@jamieblair/wind-site-intelligence-core';
import type { WindSiteTheme } from '../styles/theme.js';

export interface EnergyYieldCardProps {
  result: EnergyYieldResult;
  className?: string;
  theme?: Partial<WindSiteTheme>;
}

export function EnergyYieldCard({ result, className }: EnergyYieldCardProps): ReactNode {
  return React.createElement(
    'div',
    {
      className,
      style: {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        border: '1px solid var(--wsi-border, #e2e8f0)',
        borderRadius: '8px',
        padding: '20px',
        backgroundColor: 'var(--wsi-surface, #f8fafc)',
      },
      role: 'region',
      'aria-label': 'Energy yield estimate',
    },
    // Header
    React.createElement('h3', { style: { margin: '0 0 4px', fontSize: '16px', fontWeight: 600 } }, 'Energy Yield Estimate'),
    React.createElement(
      'div',
      { style: { fontSize: '13px', color: '#64748b', marginBottom: '16px' } },
      `${result.turbineModel.manufacturer} ${result.turbineModel.model} | Hub height: ${result.hubHeightM}m | ${result.turbineCount} turbine(s)`,
    ),

    // Main metrics
    React.createElement(
      'div',
      { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' } },
      renderMetric('Gross AEP', `${result.grossAepMwh.toFixed(0)} MWh`, `per turbine (CF ${(result.grossCapacityFactor * 100).toFixed(1)}%)`),
      renderMetric('Net AEP (P50)', `${result.netAepMwh.toFixed(0)} MWh`, `per turbine (CF ${(result.netCapacityFactor * 100).toFixed(1)}%)`),
      result.turbineCount > 1
        ? renderMetric('Total P50', `${result.netTotalAepMwh.toFixed(0)} MWh`, `${result.turbineCount} turbines`)
        : renderMetric('Confidence', result.confidence.toUpperCase(), confidenceDescription(result.confidence)),
    ),

    // P-scenarios
    React.createElement('h4', { style: { margin: '0 0 8px', fontSize: '14px', fontWeight: 600 } }, 'Exceedance Scenarios'),
    React.createElement(
      'div',
      { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' } },
      renderPScenario(result.p50),
      renderPScenario(result.p75),
      renderPScenario(result.p90),
    ),

    // Loss stack
    renderLossStack(result.losses),

    // Monthly production
    renderMonthlyChart(result.monthlyProductionMwh),

    // Assumptions
    React.createElement(
      'details',
      { style: { marginTop: '16px', fontSize: '13px' } },
      React.createElement('summary', { style: { cursor: 'pointer', fontWeight: 600 } }, 'Assumptions'),
      React.createElement(
        'div',
        { style: { marginTop: '8px', color: '#475569', lineHeight: 1.6 } },
        React.createElement('div', null, `Wind data: ${result.assumptions.windDataYears} years at ${result.assumptions.referenceHeightM}m`),
        React.createElement('div', null, `Extrapolation: ${result.assumptions.extrapolationMethod}`),
        React.createElement('div', null, `Air density: ${result.assumptions.airDensityKgM3.toFixed(3)} kg/m\u00b3`),
        React.createElement('div', null, `Weibull: k=${result.assumptions.weibullK.toFixed(2)}, c=${result.assumptions.weibullC.toFixed(1)} m/s`),
        React.createElement('div', null, `Uncertainty: ${result.assumptions.uncertaintyMethod}`),
      ),
    ),
  );
}

function renderMetric(label: string, value: string, subtitle: string): ReactNode {
  return React.createElement(
    'div',
    {
      style: {
        padding: '12px',
        backgroundColor: '#fff',
        borderRadius: '6px',
        border: '1px solid #e2e8f0',
        textAlign: 'center',
      },
    },
    React.createElement('div', { style: { fontSize: '12px', color: '#64748b', marginBottom: '4px' } }, label),
    React.createElement('div', { style: { fontSize: '20px', fontWeight: 700 } }, value),
    React.createElement('div', { style: { fontSize: '11px', color: '#94a3b8', marginTop: '2px' } }, subtitle),
  );
}

function renderPScenario(scenario: PScenario): ReactNode {
  return React.createElement(
    'div',
    {
      style: {
        padding: '10px',
        backgroundColor: '#fff',
        borderRadius: '6px',
        border: '1px solid #e2e8f0',
        textAlign: 'center',
      },
    },
    React.createElement('div', { style: { fontSize: '14px', fontWeight: 700, color: '#2563eb' } }, scenario.label),
    React.createElement('div', { style: { fontSize: '18px', fontWeight: 600, marginTop: '4px' } }, `${scenario.aepMwh.toFixed(0)} MWh`),
    React.createElement('div', { style: { fontSize: '11px', color: '#64748b', marginTop: '4px' } }, `CF ${(scenario.capacityFactor * 100).toFixed(1)}%`),
    React.createElement('div', { style: { fontSize: '11px', color: '#94a3b8', marginTop: '2px' } }, scenario.description),
  );
}

function renderLossStack(losses: LossStack): ReactNode {
  return React.createElement(
    'div',
    { style: { marginTop: '4px' } },
    React.createElement('h4', { style: { margin: '0 0 8px', fontSize: '14px', fontWeight: 600 } }, 'Loss Stack'),
    ...losses.items.map((item, i) =>
      React.createElement(
        'div',
        {
          key: i,
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 0',
            borderBottom: '1px solid #f1f5f9',
            fontSize: '13px',
          },
        },
        React.createElement('span', { style: { color: '#475569' } }, item.name),
        React.createElement(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          React.createElement(
            'div',
            {
              style: {
                width: `${Math.max(4, item.percent * 10)}px`,
                height: '12px',
                backgroundColor: '#f59e0b',
                borderRadius: '2px',
              },
            },
          ),
          React.createElement('span', { style: { fontWeight: 500, minWidth: '40px', textAlign: 'right' } }, `${item.percent.toFixed(1)}%`),
        ),
      ),
    ),
    React.createElement(
      'div',
      {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          padding: '8px 0 0',
          fontWeight: 700,
          fontSize: '13px',
        },
      },
      React.createElement('span', null, 'Total losses'),
      React.createElement('span', null, `${losses.totalLossPct.toFixed(1)}%`),
    ),
  );
}

function renderMonthlyChart(monthlyMwh: number[]): ReactNode {
  const maxVal = Math.max(...monthlyMwh, 1);
  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const barMaxHeight = 80;

  return React.createElement(
    'div',
    { style: { marginTop: '16px' } },
    React.createElement('h4', { style: { margin: '0 0 8px', fontSize: '14px', fontWeight: 600 } }, 'Monthly Production'),
    React.createElement(
      'div',
      {
        style: { display: 'flex', gap: '2px', alignItems: 'flex-end', height: `${barMaxHeight + 20}px` },
        role: 'figure',
        'aria-label': 'Monthly energy production chart',
      },
      ...monthlyMwh.map((val, i) => {
        const barHeight = Math.max(2, (val / maxVal) * barMaxHeight);
        return React.createElement(
          'div',
          {
            key: i,
            style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' },
          },
          React.createElement('div', {
            style: {
              width: '100%',
              height: `${barHeight}px`,
              backgroundColor: '#2563eb',
              borderRadius: '2px 2px 0 0',
            },
            title: `${labels[i]}: ${val.toFixed(0)} MWh`,
          }),
          React.createElement(
            'div',
            { style: { fontSize: '10px', color: '#94a3b8', marginTop: '4px' } },
            labels[i],
          ),
        );
      }),
    ),
  );
}

function confidenceDescription(level: string): string {
  if (level === 'high') return '10+ years wind data';
  if (level === 'medium') return '5-10 years wind data';
  return '< 5 years wind data';
}
