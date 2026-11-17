'use client';
import { useState } from 'react';
import type { LayoutResult } from '../../lib/designer/evaluate';
import type { Project } from '../../lib/designer/project';
const rows = [
  ['count', 'Turbines', '', 0],
  ['capacity', 'Installed capacity', 'MW', 1],
  ['spacing', 'Closest spacing', 'm', 0],
  ['energy', 'Net annual energy', 'MWh/yr', 0],
  ['wake', 'Directional wake loss', '%', 2],
  ['capacityFactor', 'Net capacity factor', '%', 1],
  ['noise', 'Receptor sound', 'dB(A)', 1],
  ['shadow', 'Theoretical shadow', 'h/yr', 1],
  ['capital', 'Capital investment', '£', 0],
  ['lcoe', 'Levelised cost', '£/MWh', 2],
  ['npv', 'Net present value', '£', 0],
] as const;
export function fmt(v: number | null | undefined, decimals = 0) {
  return typeof v === 'number' && Number.isFinite(v)
    ? v.toLocaleString('en-GB', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : '—';
}
export default function Compare({
  project,
  results,
  busy,
  error,
}: {
  project: Project;
  results: LayoutResult[] | null;
  busy: boolean;
  error: string;
}) {
  const [basis, setBasis] = useState('');
  const relative = project.layouts.some((l) => l.id === basis);
  const reference = results?.find((r) => r.id === basis);
  function value(v: number | null | undefined, base: number | null | undefined, dp: number) {
    if (!relative) return fmt(v, dp);
    if (v == null || base == null) return '—';
    const difference = v - base;
    return (difference > 0 ? '+' : '') + fmt(difference, dp);
  }
  return (
    <section className="farm-comparison" id="comparison" aria-labelledby="compare-title">
      <div className="farm-section-heading">
        <h2 id="compare-title">Layout comparison</h2>
        <span role="status">
          {error || (busy ? 'Calculating…' : project.layouts.length + ' layouts')}
        </span>
      </div>
      <p>
        Every column uses the same wind evidence, receptor and electricity price. Values update as
        you edit.
      </p>
      <label className="farm-basis">
        Compare values
        <select value={relative ? basis : ''} onChange={(ev) => setBasis(ev.target.value)}>
          <option value="">Absolute values</option>
          {project.layouts.map((l) => (
            <option value={l.id} key={l.id}>
              Difference from {l.name}
            </option>
          ))}
        </select>
      </label>
      <div className="farm-scroll" tabIndex={0} role="region" aria-label="Layout comparison table">
        <table>
          <thead>
            <tr>
              <th scope="col">Measure</th>
              {project.layouts.map((l) => (
                <th scope="col" key={l.id} className={l.id === project.active ? 'focus-col' : ''}>
                  {l.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([key, label, unit, dp]) => (
              <tr key={key}>
                <th scope="row">
                  {label} <small>{relative && unit === '%' ? 'pp' : unit}</small>
                </th>
                {project.layouts.map((l, i) => (
                  <td key={l.id} className={l.id === project.active ? 'focus-col' : ''}>
                    {value(results?.[i]?.[key], reference?.[key], dp)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {results?.some((r) => r.messages.length > 0) && (
        <ul className="farm-gaps">
          {results.map(
            (r, i) =>
              r.messages.length > 0 && (
                <li key={r.id}>
                  <strong>{project.layouts[i]?.name}</strong> · {r.messages.join(' ')}
                </li>
              ),
          )}
        </ul>
      )}
    </section>
  );
}
