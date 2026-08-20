import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { EnergyYieldResult } from '@jamieblair/windforge-core';
import { EconomicsPanel } from '../../src/components/analyse/EconomicsPanel';

const AEP: EnergyYieldResult = {
  turbineModel: { id: 'gw-2mw', manufacturer: 'Generic', model: '2MW', ratedPowerKw: 2000, rotorDiameterM: 90 },
  hubHeightM: 100,
  turbineCount: 1,
  grossAepMwh: 7800,
  grossTotalAepMwh: 7800,
  grossCapacityFactor: 0.44,
  losses: {
    wakeLossPct: 8,
    electricalLossPct: 2,
    availabilityLossPct: 3,
    environmentalLossPct: 1,
    icingLossPct: 0.5,
    hysteresisLossPct: 0.5,
    gridCurtailmentPct: 1,
    totalLossPct: 16,
    items: [],
  },
  netAepMwh: 6552,
  netTotalAepMwh: 6552,
  netCapacityFactor: 0.37,
  p50: { label: 'P50', aepMwh: 6552, totalAepMwh: 6552, capacityFactor: 0.37, description: '' },
  p75: { label: 'P75', aepMwh: 6010, totalAepMwh: 6010, capacityFactor: 0.34, description: '' },
  p90: { label: 'P90', aepMwh: 5500, totalAepMwh: 5500, capacityFactor: 0.31, description: '' },
  monthlyProductionMwh: [],
  assumptions: {
    windDataYears: 10,
    referenceHeightM: 50,
    extrapolationMethod: 'power-law',
    airDensityKgM3: 1.225,
    weibullK: 2.1,
    weibullC: 7.8,
    lossAssumptions: '',
    uncertaintyMethod: '',
  },
  confidence: 'high',
  summary: '',
};

describe('EconomicsPanel', () => {
  it('renders an LCOE headline, key metrics and the loss stack', () => {
    render(<EconomicsPanel aep={AEP} />);
    expect(screen.getByText('ECONOMICS')).toBeInTheDocument();
    // LCOE value renders as a currency-prefixed number.
    expect(screen.getByTestId('lcoe-value').textContent).toMatch(/£\d/);
    expect(screen.getByText('Net capacity factor')).toBeInTheDocument();
    expect(screen.getByText('37%')).toBeInTheDocument();
    expect(screen.getByText('Simple payback')).toBeInTheDocument();
    expect(screen.getByText('IRR')).toBeInTheDocument();
    // Loss stack derived from the named percentage fields when items is empty.
    expect(screen.getByText(/16.0% total/)).toBeInTheDocument();
    expect(screen.getByText('Wake')).toBeInTheDocument();
  });
});
