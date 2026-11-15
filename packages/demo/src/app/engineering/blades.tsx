import { useState } from 'react';
import type { Catalogue, Model } from '../../lib/engineering/types';
import { usePublicEvidence } from './public-evidence';
import { download } from './report';

type Pair = [number, number];
type Metric = 'chord' | 'twist' | 'rthick';
interface Geometry {
  revision: string;
  line: number;
  stations: { name: string; span: number }[];
  profiles: Record<string, Pair[]>;
  distributions: Record<Metric, Pair[]>;
}
const names = { chord: 'Chord', twist: 'Twist', rthick: 'Relative thickness' };
const units = { chord: 'm', twist: '°', rthick: '%' };
const shown = (metric: Metric, value: number) => (metric === 'rthick' ? value * 100 : value);
const fmt = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 2 });

function SectionPlot({ points, name }: { points: Pair[]; name: string }) {
  const scale = 235;
  const bounds = points.map(([, y]) => y);
  const middle = (Math.min(...bounds) + Math.max(...bounds)) / 2;
  const cy = 140 + middle * scale;
  const path =
    points
      .map(
        ([x, y], i) =>
          (i ? 'L' : 'M') + (35 + x * scale).toFixed(2) + ' ' + (cy - y * scale).toFixed(2),
      )
      .join(' ') + 'Z';
  return (
    <svg
      viewBox="0 0 305 280"
      role="img"
      aria-label={name + ' normalised airfoil section'}
      className="wf-section-plot"
    >
      <path d={'M20 ' + cy + 'h265'} stroke="#9baea8" strokeDasharray="4 4" />
      <path d={path} fill="#9ac9bb" stroke="#115c56" strokeWidth="2" />
    </svg>
  );
}

function Distribution({ points, metric, span }: { points: Pair[]; metric: Metric; span: number }) {
  const ys = points.map(([, y]) => shown(metric, y));
  const min = Math.min(0, ...ys),
    max = Math.max(...ys),
    x = (s: number) => 55 + 570 * s;
  const y = (v: number) => 170 - (135 * (v - min)) / (max - min || 1);
  return (
    <svg
      className="wf-distribution"
      role="img"
      aria-label={names[metric] + ' distribution along the blade, ' + units[metric]}
      viewBox="0 0 660 208"
    >
      {[min, (min + max) / 2, max].map((value) => (
        <g key={value}>
          <path d={'M55 ' + y(value) + 'H625'} stroke="#cddbd5" />
          <text x="48" y={y(value) + 4} textAnchor="end">
            {fmt(value)}
          </text>
        </g>
      ))}
      <path d={'M' + x(span) + ' 22V172'} stroke="#89591d" strokeDasharray="4 3" />
      <polyline
        points={points.map(([s, v]) => x(s) + ',' + y(shown(metric, v))).join(' ')}
        fill="none"
        stroke="#15665d"
        strokeWidth="2.5"
      />
      {points.map(([s, v]) => (
        <circle key={s} cx={x(s)} cy={y(shown(metric, v))} r="1.6" fill="#15665d" />
      ))}
      {[0, 25, 50, 75, 100].map((s) => (
        <text key={s} x={x(s / 100)} y="194" textAnchor="middle">
          {s}%
        </text>
      ))}
    </svg>
  );
}

export function BladeSections({
  m,
  cat,
  modelPicker,
  inspect,
}: {
  m: Model;
  cat: Catalogue;
  modelPicker: React.ReactNode;
  inspect: () => void;
}) {
  const result = usePublicEvidence<Geometry>('blade=' + m.id + '&release=' + cat.release);
  const [index, select] = useState(2),
    [metric, changeMetric] = useState<Metric>('chord');
  const data = result?.data,
    station = data?.stations[index];
  const source = cat.sources[m.definition];
  return (
    <section className="wf-blades">
      <div className="wf-blade-heading">
        <div>
          <h2>Blade sections</h2>
          <p>Inspect the published airfoils from root to tip.</p>
        </div>
        {modelPicker}
      </div>
      {!data || !station ? (
        <p role="status">{result?.error ?? 'Loading reference geometry…'}</p>
      ) : (
        <div className="wf-grid">
          <section className="wf-panel">
            <div>
              <small>{m.name}</small>
              <h3>Blade span</h3>
            </div>
            <div className="wf-actions wf-metrics">
              {(['chord', 'twist', 'rthick'] as const).map((key) => (
                <button key={key} aria-pressed={key === metric} onClick={() => changeMetric(key)}>
                  {names[key]}
                </button>
              ))}
            </div>
            <div className="wf-figure">
              <strong>
                {names[metric]} ({units[metric]})
              </strong>
              <Distribution
                points={data.distributions[metric]}
                metric={metric}
                span={station.span}
              />
              <small>
                Distance along the span, from root (0%) to tip (100%). The dashed line marks the
                selected airfoil.
              </small>
            </div>
            <label>
              Reference section
              <select value={index} onChange={(e) => select(Number(e.target.value))}>
                {data.stations.map((s, i) => (
                  <option key={s.span} value={i}>
                    {fmt(100 * s.span)}% span · {s.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="wf-actions">
              <button disabled={index === 0} onClick={() => select(index - 1)}>
                Previous section
              </button>
              <button
                disabled={index === data.stations.length - 1}
                onClick={() => select(index + 1)}
              >
                Next section
              </button>
            </div>
            <details>
              <summary>View {data.distributions[metric].length} source values</summary>
              <div className="wf-native-table">
                <table>
                  <thead>
                    <tr>
                      <th>Span (%)</th>
                      <th>
                        {names[metric]} ({units[metric]})
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.distributions[metric].map(([s, v]) => (
                      <tr key={s}>
                        <td>{fmt(s * 100)}</td>
                        <td>{fmt(shown(metric, v))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
          <section className="wf-panel" aria-label="Selected airfoil">
            <div>
              <small>Airfoil at {fmt(station.span * 100)}% span</small>
              <h3>{station.name}</h3>
            </div>
            <SectionPlot points={data.profiles[station.name]!} name={station.name} />
            <p>
              {data.profiles[station.name]!.length} published coordinate pairs. The drawing uses
              equal scales and a normalised chord.
            </p>
            <div className="wf-actions">
              <a href={source?.url + '#L' + data.line}>Turbine definition ↗</a>
              <button
                onClick={() =>
                  download(
                    m.id + '-blade-sections.json',
                    JSON.stringify({
                      model: m.name,
                      release: cat.release,
                      sourceUrl: source?.url,
                      ...data,
                    }),
                    'application/json',
                  )
                }
              >
                Download geometry
              </button>
            </div>
            <button onClick={inspect}>Inspect blade assembly</button>
          </section>
        </div>
      )}
    </section>
  );
}
