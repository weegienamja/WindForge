'use client';

import type { CSSProperties } from 'react';
import {
  calculateIrr,
  calculateLcoe,
  calculatePayback,
  DEFAULT_FINANCIAL_PARAMS,
  type EnergyYieldResult,
} from '@jamieblair/windforge-core';
import { DataCard } from '../primitives/DataCard';

const CURRENCY_SYMBOL: Record<string, string> = { GBP: '£', USD: '$', EUR: '€' };

function symbol(currency: string): string {
  return CURRENCY_SYMBOL[currency] ?? `${currency} `;
}

function fmtMoney(value: number, currency: string): string {
  return `${symbol(currency)}${Math.round(value).toLocaleString()}`;
}

interface LossRow {
  name: string;
  percent: number;
}

function lossRows(aep: EnergyYieldResult): LossRow[] {
  const { losses } = aep;
  if (losses.items.length > 0) {
    return losses.items.map((i) => ({ name: i.name, percent: i.percent }));
  }
  // The structured `items` list is optional; fall back to the named fields.
  return [
    { name: 'Wake', percent: losses.wakeLossPct },
    { name: 'Electrical', percent: losses.electricalLossPct },
    { name: 'Availability', percent: losses.availabilityLossPct },
    { name: 'Environmental', percent: losses.environmentalLossPct },
    { name: 'Icing', percent: losses.icingLossPct },
    { name: 'Hysteresis', percent: losses.hysteresisLossPct },
    { name: 'Grid curtailment', percent: losses.gridCurtailmentPct },
  ].filter((r) => r.percent > 0);
}

export interface EconomicsPanelProps {
  aep: EnergyYieldResult;
  className?: string;
  style?: CSSProperties;
}

/**
 * Levelised cost, payback and IRR for the selected turbine + yield, derived
 * client-side from the AEP result using the engine's UK-onshore default
 * financial assumptions. Also visualises the energy loss stack.
 */
export function EconomicsPanel({ aep, className, style }: EconomicsPanelProps) {
  const params = DEFAULT_FINANCIAL_PARAMS;
  const lcoe = calculateLcoe(aep);
  const payback = calculatePayback(aep);
  const irr = calculateIrr(aep);
  const losses = lossRows(aep);
  const maxLoss = Math.max(1, ...losses.map((l) => l.percent));

  // Headline read: does LCOE undercut the assumed sale price?
  const margin = params.energyPricePerMwh - lcoe.lcoePerMwh;
  const marginPositive = margin >= 0;

  return (
    <DataCard eyebrow="ECONOMICS" className={className} style={style}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <span className="t-mono-large" data-testid="lcoe-value">
          {symbol(params.currency)}
          {lcoe.lcoePerMwh.toFixed(0)}
        </span>
        <span className="t-caption" style={{ color: 'var(--text-secondary)' }}>
          /MWh levelised cost
        </span>
      </div>
      <p
        className="t-body"
        style={{
          margin: 'var(--space-2) 0 var(--space-4)',
          fontSize: 13,
          color: marginPositive ? 'var(--confidence-high)' : 'var(--accent-warm)',
        }}
      >
        {marginPositive
          ? `${symbol(params.currency)}${Math.abs(margin).toFixed(0)}/MWh below the ${symbol(params.currency)}${params.energyPricePerMwh}/MWh reference price — margin-positive.`
          : `${symbol(params.currency)}${Math.abs(margin).toFixed(0)}/MWh above the ${symbol(params.currency)}${params.energyPricePerMwh}/MWh reference price — subsidy-dependent.`}
      </p>

      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 'var(--space-3)',
        }}
      >
        <Metric label="Net capacity factor" value={`${(aep.netCapacityFactor * 100).toFixed(0)}%`} />
        <Metric
          label="Simple payback"
          value={
            Number.isFinite(payback.simplePaybackYears)
              ? `${payback.simplePaybackYears.toFixed(1)} yr`
              : '—'
          }
        />
        <Metric
          label="IRR"
          value={irr.converged ? `${(irr.irr * 100).toFixed(1)}%` : '—'}
        />
        <Metric label="Est. CAPEX" value={fmtMoney(lcoe.breakdown.capex, params.currency)} />
      </ul>

      <div style={{ marginTop: 'var(--space-5)' }}>
        <div className="t-eyebrow" style={{ marginBottom: 'var(--space-2)' }}>
          Energy losses · {aep.losses.totalLossPct.toFixed(1)}% total
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {losses.map((l) => (
            <li key={l.name} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 44px', alignItems: 'center', gap: 8 }}>
              <span className="t-caption" style={{ color: 'var(--text-secondary)' }}>
                {l.name}
              </span>
              <span
                style={{
                  height: 6,
                  background: 'var(--surface-elevated)',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    height: '100%',
                    width: `${(l.percent / maxLoss) * 100}%`,
                    background: 'var(--accent-cool)',
                  }}
                />
              </span>
              <span className="t-mono-data" style={{ fontSize: 12, textAlign: 'right' }}>
                {l.percent.toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p
        className="t-caption"
        style={{ color: 'var(--text-tertiary)', marginTop: 'var(--space-4)', marginBottom: 0, fontSize: 11 }}
      >
        Assumes {symbol(params.currency)}
        {(params.capexPerMw / 1_000_000).toFixed(1)}M/MW CAPEX, {symbol(params.currency)}
        {params.energyPricePerMwh}/MWh price, {(params.discountRate * 100).toFixed(0)}% discount rate,{' '}
        {params.projectLifeYears}-year life. Indicative only.
      </p>
    </DataCard>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <li>
      <div className="t-eyebrow" style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </div>
      <div className="t-mono-data" style={{ fontSize: 18, marginTop: 2 }}>
        {value}
      </div>
    </li>
  );
}
