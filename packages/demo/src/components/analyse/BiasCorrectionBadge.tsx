'use client';

import type { ReconciliationMetadata } from '@jamieblair/windforge-core';

export type BiasCorrectionBadgeProps = {
  reconciliation: ReconciliationMetadata;
};

/**
 * Shows correction provenance and overlap diagnostics when an advanced caller
 * supplied a reviewed reanalysis series.
 */
export function BiasCorrectionBadge({ reconciliation }: BiasCorrectionBadgeProps) {
  const { reference, diagnostics } = reconciliation;
  if (!reference || !diagnostics) return null;

  const refLabel = reference.toUpperCase();
  const rmseBefore = diagnostics.rmseBeforeMs.toFixed(2);
  const rmseAfter = diagnostics.rmseAfterMs.toFixed(2);

  return (
    <div
      data-testid="bias-correction-badge"
      role="status"
      aria-label={`Bias-corrected against ${refLabel}, ${diagnostics.overlapMonths} overlap months, RMSE ${rmseBefore} to ${rmseAfter} metres per second.`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        marginTop: 'var(--space-4)',
        padding: '10px 14px',
        background: 'var(--accent-cool-dim)',
        border: '1px solid var(--accent-cool)',
        borderRadius: 4,
      }}
    >
      <div className="t-eyebrow" style={{ color: 'var(--accent-cool)' }}>
        Bias-corrected
      </div>
      <div
        className="t-mono-data"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
          color: 'var(--text-primary)',
        }}
      >
        <span>{refLabel}</span>
        <span aria-hidden="true">·</span>
        <span>{diagnostics.overlapMonths} months overlap</span>
        <span aria-hidden="true">·</span>
        <span>
          RMSE {rmseBefore} → {rmseAfter} m/s
        </span>
      </div>
    </div>
  );
}
