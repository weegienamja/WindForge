'use client';

import type { CompareSnapshot } from '../../hooks/useCompare';

export interface CompareTrayProps {
  items: CompareSnapshot[];
  onLoad: (item: CompareSnapshot) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  activeId?: string | null;
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 10px',
  color: 'var(--text-tertiary)',
  fontWeight: 500,
  whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '8px 10px',
  borderTop: '1px solid var(--border-subtle)',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
};

function num(value: number | null, suffix = '', digits = 0): string {
  return value === null || !Number.isFinite(value)
    ? '—'
    : `${value.toLocaleString(undefined, { maximumFractionDigits: digits })}${suffix}`;
}

/**
 * Side-by-side comparison of pinned sites. Highlights the best composite score
 * and lowest LCOE so the strongest candidate is obvious at a glance.
 */
export function CompareTray({ items, onLoad, onRemove, onClear, activeId }: CompareTrayProps) {
  if (items.length === 0) return null;

  const bestScore = Math.max(...items.map((i) => i.composite));
  const lcoes = items.map((i) => i.lcoePerMwh).filter((v): v is number => v !== null);
  const bestLcoe = lcoes.length > 0 ? Math.min(...lcoes) : null;

  return (
    <section
      data-testid="compare-tray"
      style={{
        maxWidth: 1400,
        margin: '0 auto',
        padding: '0 var(--space-5) var(--space-7)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-3)',
        }}
      >
        <div className="t-eyebrow">Compare · {items.length} site{items.length === 1 ? '' : 's'}</div>
        <button
          type="button"
          onClick={onClear}
          className="t-mono-data"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 12,
            padding: 0,
          }}
        >
          Clear all
        </button>
      </div>
      <div
        style={{
          overflowX: 'auto',
          border: '1px solid var(--border-subtle)',
          borderRadius: 4,
          background: 'var(--surface-1)',
        }}
      >
        <table
          className="t-mono-data"
          style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}
        >
          <thead>
            <tr>
              <th style={th}>Location</th>
              <th style={{ ...th, textAlign: 'right' }}>Score</th>
              <th style={{ ...th, textAlign: 'right' }}>Wind</th>
              <th style={{ ...th, textAlign: 'right' }}>Net AEP</th>
              <th style={{ ...th, textAlign: 'right' }}>LCOE</th>
              <th style={{ ...th, textAlign: 'right' }}>Hard limits</th>
              <th style={th} aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const isActive = activeId === item.id;
              return (
                <tr
                  key={item.id}
                  style={{ background: isActive ? 'var(--surface-elevated)' : 'transparent' }}
                >
                  <td style={td}>
                    <button
                      type="button"
                      onClick={() => onLoad(item)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--accent-cool)',
                        cursor: 'pointer',
                        padding: 0,
                        fontFamily: 'inherit',
                        fontSize: 13,
                        textAlign: 'left',
                      }}
                    >
                      {item.placeName ?? `${item.lat.toFixed(2)}, ${item.lng.toFixed(2)}`}
                    </button>
                  </td>
                  <td
                    style={{
                      ...td,
                      textAlign: 'right',
                      color:
                        item.composite === bestScore
                          ? 'var(--confidence-high)'
                          : 'var(--text-primary)',
                      fontWeight: item.composite === bestScore ? 600 : 400,
                    }}
                  >
                    {item.composite.toFixed(0)}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>{num(item.windSpeedMs, ' m/s', 1)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{num(item.netAepMwh, ' MWh')}</td>
                  <td
                    style={{
                      ...td,
                      textAlign: 'right',
                      color:
                        bestLcoe !== null && item.lcoePerMwh === bestLcoe
                          ? 'var(--confidence-high)'
                          : 'var(--text-primary)',
                      fontWeight: bestLcoe !== null && item.lcoePerMwh === bestLcoe ? 600 : 400,
                    }}
                  >
                    {item.lcoePerMwh === null ? '—' : `£${item.lcoePerMwh.toFixed(0)}`}
                  </td>
                  <td
                    style={{
                      ...td,
                      textAlign: 'right',
                      color: item.hardConstraints > 0 ? 'var(--accent-warm)' : 'var(--text-secondary)',
                    }}
                  >
                    {item.hardConstraints}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => onRemove(item.id)}
                      aria-label={`Remove ${item.placeName ?? 'site'} from comparison`}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-tertiary)',
                        cursor: 'pointer',
                        fontSize: 14,
                        padding: 0,
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
