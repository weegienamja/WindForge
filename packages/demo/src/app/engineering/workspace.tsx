'use client';
import Link from 'next/link';
import { useEffect, useState, useRef, type FormEvent } from 'react';
import type { SiteAnalysis } from '@jamieblair/windforge-core';
import type { Catalogue, Config, Report, Answer, Saved, Model } from '../../lib/engineering/types';
import { Diagram } from './diagram';
import { BladeSections } from './blades';
import { SourceLibrary } from './library';
import { download, markdown } from './report';
import './engineering.css';
const views = {
  'Turbine explorer': 'turbines',
  'Blade sections': 'blades',
  'Source library': 'library',
  'Evidence desk': 'evidence',
  'Site comparison': 'compare',
  'Saved work': 'saved',
} as const;
type Tab = keyof typeof views;
const tabs = Object.keys(views) as Tab[];
const initial = (model: string, count: number, hub: number): Config => ({
  model,
  count,
  hub,
  wake: 8,
  sector: 'whole',
  capex: null,
  opex: null,
});
async function request<T>(op: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch('/api/engineering', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op, ...args }),
  });
  const x = await r.json();
  if (!r.ok) throw Error(x.error ?? 'Engineering service unavailable.');
  return x;
}
const fmt = (v: number | null | undefined, d = 1) =>
  v == null ? 'Withheld' : v.toLocaleString('en-GB', { maximumFractionDigits: d });
function Curve({ m }: { m: Model }) {
  const max = m.ratedKw * 1.04;
  return (
    <svg className="plot" viewBox="0 0 480 115" aria-label={'Published power curve for ' + m.name}>
      <title>Wind speed (m/s) and modelled electrical power (MW)</title>
      <path d="M43 10v80h403" fill="none" stroke="#a3b4af" />
      <path d="M43 50h403" stroke="#d1dfda" />
      <polyline
        points={m.curve
          .map((p) => 43 + (p[0] / 26) * 403 + ',' + (90 - (p[1] / max) * 78))
          .join(' ')}
        fill="none"
        stroke="#007a70"
        strokeWidth="2.6"
      />
      <g fontSize="12" fill="#405856">
        <text x="2" y="19">
          {fmt(m.ratedKw / 1000)} MW
        </text>
        <text x="24" y="94">
          0
        </text>
        <text x="46" y="107">
          0
        </text>
        <text x="181" y="107">
          10
        </text>
        <text x="335" y="107">
          20
        </text>
        <text x="405" y="107">
          m/s
        </text>
      </g>
    </svg>
  );
}
function ConfigForm({
  c,
  set,
  models,
  side,
}: {
  c: Config;
  set: (c: Config) => void;
  models: Model[];
  side: string;
}) {
  return (
    <div>
      <h3>
        <span className="caseletter">{side}</span> · Configuration
      </h3>
      <label>
        Reference turbine
        <select
          value={c.model}
          onChange={(e) => {
            const m = models.find((x) => x.id === e.target.value)!;
            set({ ...c, model: m.id, hub: m.hubM, soundDba: null, soundSource: '' });
          }}
        >
          {models.map((m) => (
            <option value={m.id} key={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <div className="wf-fields">
        {(['count', 'hub', 'wake'] as const).map((k, i) => (
          <label key={k}>
            {['Count', 'Hub (m)', 'Wake loss (%)'][i]}
            <input
              type="number"
              value={Number.isFinite(c[k]) ? c[k] : ''}
              step={k === 'count' ? 1 : 'any'}
              onChange={(e) => set({ ...c, [k]: e.target.valueAsNumber })}
            />
          </label>
        ))}
      </div>
      <label>
        Boundary partition
        <select
          value={c.sector}
          onChange={(e) => set({ ...c, sector: e.target.value as Config['sector'] })}
        >
          <option value="whole">Entire boundary</option>
          <option value="west">West of midpoint</option>
          <option value="east">East of midpoint</option>
        </select>
      </label>
      <details>
        <summary>Acoustic input</summary>
        <p className="muted">
          Provide a documented overall A-weighted source power for this model and operating state.
          Propagation requires a parcel and receptor.
        </p>
        <label>
          Source sound power (dBA)
          <input
            type="number"
            value={c.soundDba ?? ''}
            onChange={(e) =>
              set({ ...c, soundDba: e.target.value === '' ? null : e.target.valueAsNumber })
            }
          />
        </label>
        <label>
          Source reference and operating condition
          <input
            value={c.soundSource ?? ''}
            onChange={(e) => set({ ...c, soundSource: e.target.value })}
          />
        </label>
      </details>
      <details>
        <summary>Financial assumptions</summary>
        <div className="wf-fields">
          {(['capex', 'opex'] as const).map((k, i) => (
            <label key={k}>
              {i ? 'Annual OPEX (£/MW)' : 'CAPEX (£/MW)'}
              <input
                type="number"
                value={c[k] ?? ''}
                onChange={(e) =>
                  set({ ...c, [k]: e.target.value === '' ? null : e.target.valueAsNumber })
                }
              />
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}
function Result({ r }: { r: Report }) {
  const rows: [string, (i: number) => string][] = [
    ['Installed capacity (MW)', (i) => fmt(r.cases[i]?.capacityMw, 2)],
    ['Net energy (MWh/year)', (i) => fmt(r.cases[i]?.energy?.netTotalAepMwh, 0)],
    ['Wake loss (%)', (i) => fmt(r.cases[i]?.energy?.losses.wakeLossPct)],
    ['Available grid positions', (i) => (r.geometry ? fmt(r.cases[i]?.layoutCount) : 'No parcel')],
    ['Receptor noise (dBA)', (i) => fmt(r.cases[i]?.noiseDba)],
    ['Flicker (hours/year)', (i) => fmt(r.cases[i]?.shadowHours)],
    ['LCOE (£/MWh)', (i) => fmt(r.cases[i]?.lcoe, 2)],
  ];
  return (
    <>
      <h2>Comparison result</h2>
      <p>
        {r.deltaMwh === null
          ? 'A net energy difference cannot be established from these inputs.'
          : 'B produces ' +
            fmt(Math.abs(r.deltaMwh), 0) +
            ' MWh/year ' +
            (r.deltaMwh >= 0 ? 'more' : 'less') +
            ' than A under the stated assumptions.'}
      </p>
      <table>
        <thead>
          <tr>
            <th>Measure</th>
            <th>A</th>
            <th>B</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, f]) => (
            <tr key={k}>
              <td>{k}</td>
              <td>{f(0)}</td>
              <td>{f(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {r.geometry && <Layout r={r} />}
      {r.cases.map((c, i) => (
        <details key={i}>
          <summary>
            {i ? 'B' : 'A'} · {c.label} · basis and gaps
          </summary>
          <ul>
            {[...c.basis, ...c.gaps].map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </details>
      ))}
      <small>
        Knowledge {r.release} · {r.engine}
      </small>
    </>
  );
}
function Layout({ r }: { r: Report }) {
  if (!r.geometry) return null;
  const p = r.geometry.ring;
  const xs = p.map((p) => p.lng),
    ys = p.map((p) => p.lat),
    x = Math.min(...xs),
    y = Math.max(...ys),
    cos = Math.cos((y * Math.PI) / 180),
    s = Math.min(200 / ((Math.max(...xs) - x) * cos), 140 / (y - Math.min(...ys)));
  const xy = (p: { lng: number; lat: number }) => [
    12 + (p.lng - x) * s * cos,
    12 + (y - p.lat) * s,
  ];
  return (
    <div className="wf-casepair">
      {r.cases.map((c, i) => (
        <svg
          key={i}
          viewBox="0 0 225 185"
          className="plot"
          aria-label={'Candidate positions ' + (i ? 'B' : 'A')}
        >
          <polygon
            points={p.map((a) => xy(a).join(',')).join(' ')}
            fill="#dce9e1"
            stroke="#65887b"
          />
          {c.positions.map((p) => (
            <circle key={p.lng + ',' + p.lat} cx={xy(p)[0]} cy={xy(p)[1]} r="4" fill="#006c65" />
          ))}
          <text x="10" y="177" fontSize="12">
            {i ? 'B' : 'A'} · {c.positions.length} placed
          </text>
        </svg>
      ))}
    </div>
  );
}
export default function Workspace({ initialTab = 'Turbine explorer' }: { initialTab?: Tab }) {
  const [cat, setCat] = useState<Catalogue | null>(null),
    [tab, T] = useState<Tab>(initialTab),
    [model, M] = useState('iea34'),
    [part, P] = useState('assembly'),
    [scope, S] = useState('model');
  const [busy, B] = useState(''),
    [err, E] = useState(''),
    [msg, G] = useState(''),
    [lat, La] = useState('58.45'),
    [lng, Lo] = useState('-3.65'),
    [site, Site] = useState<SiteAnalysis | null>(null),
    [sid, SI] = useState(''),
    [setting, Setting] = useState('unknown');
  const [a, A] = useState(initial('iea34', 6, 110)),
    [b, Bb] = useState(initial('iea15', 4, 150)),
    [geo, Geo] = useState(''),
    [receptor, Rec] = useState(''),
    [title, Title] = useState(''),
    [report, R] = useState<Report | null>(null),
    [rid, RI] = useState(''),
    [saved, H] = useState<Saved[]>([]);
  const [useInference, Infer] = useState(false);
  const [q, Q] = useState(''),
    [answers, Ans] = useState<(Answer & { question?: string })[]>([]),
    [choices, Choices] = useState<string[]>([]),
    [note, N] = useState(''),
    [filename, F] = useState(''),
    [origin, O] = useState(''),
    [record, RecordId] = useState('');
  const loaded = useRef(false),
    handoff = useRef<Record<string, unknown> | undefined>(undefined);
  const m = cat?.models.find((v) => v.id === model),
    n = m?.nodes.find((x) => x.id === part) ?? m?.nodes.find((x) => x.id === 'assembly');
  function pick(id: string) {
    M(id);
    P('assembly');
    RecordId('');
    S('model');
    Choices([]);
  }
  async function act(label: string, fn: () => Promise<void>) {
    B(label);
    E('');
    G('');
    try {
      await fn();
    } catch (e) {
      E(e instanceof Error ? e.message : 'Operation failed.');
    } finally {
      B('');
    }
  }
  async function reload() {
    const list = await request<Saved[]>('list');
    H(list);
    return list;
  }
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void act('Loading engineering library', async () => {
      const res = await fetch('/api/engineering');
      if (!res.ok) throw Error('Engineering library unavailable. Reload to retry.');
      const catalogue: Catalogue = await res.json();
      if (!Array.isArray(catalogue.models) || !catalogue.models.length)
        throw Error('No reference designs are available. Reload to retry.');
      setCat(catalogue);
      const u = new URL(location.href);
      const requested = tabs.find((t) => views[t] === u.searchParams.get('view'));
      if (requested) T(requested);
      const entryModel = catalogue.models.find((v) => v.id === u.searchParams.get('model'));
      if (entryModel) {
        M(entryModel.id);
        const entryPart = entryModel.nodes.find((v) => v.id === u.searchParams.get('component'));
        if (entryPart) P(entryPart.id);
      }
      if (u.searchParams.has('lat') && u.searchParams.has('lng')) {
        La(u.searchParams.get('lat')!);
        Lo(u.searchParams.get('lng')!);
        if (!requested) T('Site comparison');
        try {
          handoff.current = JSON.parse(sessionStorage.getItem('wf-handoff') ?? 'null') ?? undefined;
        } catch {}
      }
      const list = await reload();
      const item = u.searchParams.get('item');
      if (item) {
        const ref = list.find((x) => x.id === item);
        if (ref) await open(ref);
        else throw Error('That item is not available in this browser workspace.');
      }
    });
  }, []);
  const takeSite = () =>
    act('Retrieving site evidence', async () => {
      if (!lat.trim() || !lng.trim()) throw Error('Enter both coordinates.');
      const coordinate = { lat: Number(lat), lng: Number(lng) };
      const h = handoff.current as { site?: SiteAnalysis; signature?: string } | undefined;
      const x = await request<{ id: string; site: SiteAnalysis }>('site', {
        coordinate,
        ...(h?.site?.coordinate.lat === coordinate.lat && h.site.coordinate.lng === coordinate.lng
          ? h
          : {}),
      });
      SI(x.id);
      Site(x.site);
      R(null);
      RI('');
      Ans([]);
      await reload();
      G('Site evidence saved to this browser workspace.');
    });
  const calculate = () =>
    act('Calculating both configurations', async () => {
      let rec = null;
      if (receptor.trim()) {
        const pair = receptor.split(',');
        if (pair.length !== 2 || pair.some((v) => !v.trim() || !Number.isFinite(Number(v))))
          throw Error('Enter receptor latitude, longitude.');
        rec = { lat: Number(pair[0]), lng: Number(pair[1]) };
      }
      const x = await request<{ id: string; report: Report }>('compare', {
        siteId: sid,
        configs: [a, b],
        title,
        setting,
        boundary: geo.trim() ? JSON.parse(geo) : null,
        receptor: rec,
      });
      RI(x.id);
      R(x.report);
      Ans([]);
      await reload();
      G('Calculated and saved both configurations.');
    });
  function openReport(id: string, r: Report) {
    R(r);
    RI(id);
    Site(r.site);
    SI(r.siteId);
    La(String(r.site.coordinate.lat));
    Lo(String(r.site.coordinate.lng));
    A(r.cases[0]!.config);
    Bb(r.cases[1]!.config);
    Setting(r.setting);
    Rec(r.receptor ? r.receptor.lat + ', ' + r.receptor.lng : '');
    Geo(
      r.geometry
        ? JSON.stringify({
            type: 'Polygon',
            coordinates: [[...r.geometry.ring, r.geometry.ring[0]!].map((p) => [p.lng, p.lat])],
          })
        : '',
    );
    Ans([]);
    T('Site comparison');
  }
  const open = (x: Saved) =>
    act('Opening saved work', async () => {
      const v = await request<{ content: unknown }>('get', { id: x.id });
      if (x.kind === 'comparison') {
        openReport(x.id, v.content as Report);
        Ans(await request('journal', { id: x.id }));
      } else if (x.kind === 'site') {
        const s = v.content as SiteAnalysis;
        Site(s);
        SI(x.id);
        La(String(s.coordinate.lat));
        Lo(String(s.coordinate.lng));
        RI('');
        R(null);
        Ans([]);
        Geo('');
        Rec('');
        T('Site comparison');
      } else {
        const c = v.content as {
          model: string;
          component: string;
          text: string;
          provenance: string;
          entryType?: string;
          answer?: Answer;
          reportId?: string;
        };
        if (c.entryType === 'answer') {
          if (c.reportId) {
            const rep = await request<{ content: Report }>('get', { id: c.reportId });
            openReport(c.reportId, rep.content);
          } else {
            RI('');
            R(null);
          }
          Ans(c.answer ? [c.answer] : []);
        } else {
          pick(c.model);
          P(c.component);
          RecordId(x.id);
          N(c.text);
          F(x.title);
          O(c.provenance);
        }
        T('Evidence desk');
      }
    });
  function ask(event?: FormEvent) {
    event?.preventDefault();
    if (!m || !n) return;
    void act('Checking evidence', async () => {
      if (
        /^(?:what (?:changes )?if (?:we )?)?(?:replace|compare)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(
          q,
        )
      ) {
        const x = await request<{ id: string; report: Report }>('recalculate', {
          reportId: rid,
          question: q,
          title: 'Variation · ' + q.slice(0, 90),
        });
        openReport(x.id, x.report);
        await reload();
        G('Saved a newly calculated variation.');
        return;
      }
      const result = await request<Answer>('ask', {
        question: q,
        model: m.id,
        component: n.id,
        scope: scope === 'model' ? m.id : scope,
        useInference,
        reportId: rid || null,
        recordId: record || null,
      });
      Ans((prev) => [...prev, { ...result, question: q }]);
      Q('');
      await reload();
    });
  }
  function exports(kind: 'json' | 'md') {
    if (!report) return;
    download(
      'WindForge-' + rid + '.' + kind,
      kind === 'md'
        ? markdown(report, answers)
        : JSON.stringify({ report, questions: answers }, null, 2),
      kind === 'md' ? 'text/markdown' : 'application/json',
    );
  }
  const move = (t: Tab) => {
    T(t);
    E('');
    G('');
  };
  useEffect(() => {
    if (!cat) return;
    const url = new URL(location.href);
    url.searchParams.set('view', views[tab]);
    url.searchParams.set('model', model);
    url.searchParams.set('component', part);
    window.history.replaceState(window.history.state, '', url);
  }, [cat, tab, model, part]);
  const formChanged =
    site && (Number(lat) !== site.coordinate.lat || Number(lng) !== site.coordinate.lng);
  const selectModel = (
    <label>
      Reference design
      <select value={model} onChange={(e) => pick(e.target.value)}>
        {cat?.models.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
    </label>
  );
  const selectPart = (
    <label>
      Assembly or component
      <select
        value={part}
        onChange={(e) => {
          P(e.target.value);
          RecordId('');
          Choices([]);
        }}
      >
        {m?.nodes
          .slice()
          .sort((a, b) =>
            (a.id === 'assembly' ? '' : a.path).localeCompare(b.id === 'assembly' ? '' : b.path),
          )
          .map((v) => (
            <option key={v.id} value={v.id}>
              {v.path.split('.').length > 2 ? '↳ ' : ''}
              {v.label}
              {v.id.includes('-') ? ' · ' + v.parent : ''}
            </option>
          ))}
      </select>
    </label>
  );
  return (
    <main className="wf-work">
      <header className="wf-head">
        <div>
          <Link className="wf-brand" href="/">
            WindForge
          </Link>
          <nav aria-label="Site tools">
            <Link href="/analyse">Site analysis</Link> <Link href="/map">UK map</Link>
          </nav>
        </div>
      </header>
      <div className="wf-frame">
        <div className="wf-intro">
          <div>
            <h1>Wind turbine engineering</h1>
          </div>
          <p>
            {site
              ? 'Site · ' + site.coordinate.lat.toFixed(3) + ', ' + site.coordinate.lng.toFixed(3)
              : 'Reference designs, component geometry and research evidence'}
          </p>
        </div>
        <nav className="wf-tabs" aria-label="Workspace sections">
          {tabs.map((t) => (
            <button key={t} aria-current={tab === t} onClick={() => move(t)}>
              {t}
            </button>
          ))}
        </nav>
        {busy && (
          <p role="status" className="notice">
            {busy}…
          </p>
        )}
        {err && (
          <p role="alert" className="notice err">
            {err}
          </p>
        )}
        {msg && (
          <p role="status" className="notice">
            {msg}
          </p>
        )}
        {cat && m && n && (
          <>
            {tab === 'Blade sections' && (
              <BladeSections
                key={m.id}
                m={m}
                cat={cat}
                modelPicker={selectModel}
                inspect={() => {
                  P('blade');
                  RecordId('');
                  move('Turbine explorer');
                }}
              />
            )}
            {tab === 'Source library' && (
              <SourceLibrary
                cat={cat}
                investigate={(collection) => {
                  if (cat.models.some((v) => v.id === collection)) {
                    pick(collection);
                    S('model');
                  } else if (collection === 'grc') {
                    pick('iea34');
                    P('gearbox');
                    S('grc');
                    Q('Which measurements help investigate gearbox vibration?');
                  } else {
                    S(collection);
                    RecordId('');
                  }
                  Choices([]);
                  move('Evidence desk');
                }}
              />
            )}
            {tab === 'Turbine explorer' && (
              <div className="wf-grid">
                <section className="wf-panel">
                  <div className="wf-fields">
                    {selectModel}
                    <div>
                      <small>{m.setting} · reference design</small>
                      <h2>{m.name}</h2>
                    </div>
                  </div>
                  <Diagram
                    model={m}
                    part={n}
                    select={(v) => {
                      if (m.nodes.some((n) => n.id === v)) {
                        P(v);
                        RecordId('');
                      }
                    }}
                  />
                  <small>
                    Illustrative geometry. Select a system in the drawing or use the component list.
                  </small>
                  <div className="wf-actions">
                    <button className="primary" onClick={() => move('Blade sections')}>
                      Explore blade geometry
                    </button>
                    <button
                      onClick={() => {
                        A({ ...a, model: m.id, hub: m.hubM, soundDba: null, soundSource: '' });
                        move('Site comparison');
                      }}
                    >
                      Use in configuration A
                    </button>
                    <button onClick={() => move('Evidence desk')}>
                      Investigate this component
                    </button>
                  </div>
                  <details>
                    <summary>Electrical performance · {m.curve.length} source points</summary>
                    <Curve m={m} />
                    <a href={cat.sources[m.performance]?.url}>{m.curveLocator}</a>
                  </details>
                </section>
                <aside className="wf-panel">
                  {selectPart}
                  <h2>{n.label}</h2>
                  {n.function && (
                    <p>
                      {n.function} <a href={cat.sources['doe-functions']?.url}>Function source</a>
                    </p>
                  )}
                  <p>
                    {n.description ||
                      'The selected reference file defines this component at ' + n.path + '.'}
                  </p>
                  <dl className="wf-facts">
                    {n.facts.map((f) => (
                      <div key={f.path + f.field}>
                        <dt>{f.field.replaceAll('_', ' ')}</dt>
                        <dd>
                          {f.unit === 'ratio' && typeof f.value === 'number'
                            ? f.value + ':1'
                            : f.unit === 'fraction' && typeof f.value === 'number'
                              ? fmt(f.value * 100, 3) + '%'
                              : Array.isArray(f.value)
                                ? f.value.join(', ')
                                : typeof f.value === 'number'
                                  ? fmt(f.value, 6)
                                  : f.value}{' '}
                          {['ratio', 'fraction', 'count'].includes(f.unit) ? '' : f.unit}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {n.facts.length === 0 && <p>No scalar specification extracted at this level.</p>}
                  <div className="wf-actions">
                    {m.nodes
                      .filter((v) => v.parent === n.id)
                      .map((v) => (
                        <button
                          key={v.id}
                          onClick={() => {
                            P(v.id);
                            RecordId('');
                          }}
                        >
                          {v.label}
                        </button>
                      ))}
                  </div>
                  {n.id === 'gearbox' && (
                    <button
                      onClick={() => {
                        S('grc');
                        Q('Which measurements help investigate gearbox vibration?');
                        move('Evidence desk');
                      }}
                    >
                      Explore separate GRC gearbox evidence
                    </button>
                  )}
                  <p className="source">
                    <a href={cat.sources[n.source]?.url + (n.line ? '#L' + n.line : '')}>
                      Definition · {n.path}
                    </a>
                    <br />
                    <small>
                      windIO {m.schema} · revision {m.revision.slice(0, 10)}.{' '}
                      <a href={cat.sources['windio-schema']?.url}>Schema descriptions</a>
                    </small>
                  </p>
                </aside>
              </div>
            )}
            {tab === 'Site comparison' && (
              <div className="wf-grid">
                <div className="wf-stack">
                  <section className="wf-panel">
                    <h2>Site evidence</h2>
                    <div className="wf-fields">
                      <label>
                        Latitude
                        <input
                          value={lat}
                          onChange={(e) => La(e.target.value)}
                          type="number"
                          step="any"
                        />
                      </label>
                      <label>
                        Longitude
                        <input
                          value={lng}
                          onChange={(e) => Lo(e.target.value)}
                          type="number"
                          step="any"
                        />
                      </label>
                      <button disabled={!!busy} onClick={takeSite}>
                        {site ? 'Refresh site' : 'Analyse site'}
                      </button>
                    </div>
                    {site && (
                      <p>
                        {site.metadata.completeness.detail} Composite:{' '}
                        {site.compositeScore ?? 'withheld'}.{' '}
                        <Link
                          href={
                            '/analyse?lat=' + site.coordinate.lat + '&lng=' + site.coordinate.lng
                          }
                        >
                          Inspect all six factors
                        </Link>
                      </p>
                    )}
                    {formChanged && <small>Refresh to use the new coordinates.</small>}
                  </section>
                  <section className="wf-panel">
                    <h2>Turbine fit</h2>
                    <div className="wf-casepair">
                      <ConfigForm c={a} set={A} models={cat.models} side="A" />
                      <ConfigForm c={b} set={Bb} models={cat.models} side="B" />
                    </div>
                    <div className="wf-fields">
                      <label>
                        Site setting
                        <select value={setting} onChange={(e) => Setting(e.target.value)}>
                          <option value="unknown">Unconfirmed</option>
                          <option value="onshore">Onshore</option>
                          <option value="offshore">Offshore</option>
                        </select>
                      </label>
                      <label>
                        Comparison title
                        <input
                          value={title}
                          placeholder="Configuration comparison"
                          onChange={(e) => Title(e.target.value)}
                        />
                      </label>
                    </div>
                    <details>
                      <summary>Parcel, site bisect and receptor</summary>
                      <p>
                        Supply one closed GeoJSON polygon near the site. West/east partitions use
                        turbine centres on either side of the parcel’s longitude midpoint. Without a
                        parcel, counts are hypothetical.
                      </p>
                      <label>
                        Parcel GeoJSON
                        <textarea rows={3} value={geo} onChange={(e) => Geo(e.target.value)} />
                      </label>
                      <label>
                        Receptor latitude, longitude
                        <input value={receptor} onChange={(e) => Rec(e.target.value)} />
                      </label>
                    </details>
                    <p className="muted">
                      With positions and source thrust data, Jensen replaces the entered wake loss.
                      Other losses use WindForge’s screening defaults.
                    </p>
                    <button
                      className="primary"
                      disabled={!!busy || !sid || !!formChanged}
                      onClick={calculate}
                    >
                      Calculate and save comparison
                    </button>
                  </section>
                </div>
                <aside className="wf-panel">
                  {report ? (
                    <>
                      <Result r={report} />
                      <div className="wf-actions">
                        <button onClick={() => exports('md')}>Download report</button>
                        <button onClick={() => exports('json')}>Export JSON</button>
                        <button onClick={() => move('Evidence desk')}>Ask about this result</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <h2>Comparison evidence</h2>
                      <p>
                        Analyse a site, then calculate both configurations. This view will show
                        their energy difference, model assumptions and the evidence still missing.
                      </p>
                    </>
                  )}
                </aside>
              </div>
            )}
            {tab === 'Evidence desk' && (
              <div className="wf-grid">
                <section className="wf-panel">
                  <h2>Ask an engineering question</h2>
                  <div className="wf-fields">
                    {selectModel}
                    {selectPart}
                  </div>
                  <label>
                    Evidence scope
                    <select value={scope} onChange={(e) => S(e.target.value)}>
                      <option value="model">Selected reference turbine</option>
                      <option value="grc">GRC research gearboxes · separate assembly</option>
                      <option value="method">OpenFAST · BeamDyn methods</option>
                      <option value="schema">windIO definitions</option>
                    </select>
                  </label>
                  {report && (
                    <p className="muted">
                      Comparison in context: {report.cases.map((c) => c.label).join(' / ')}
                    </p>
                  )}
                  <form onSubmit={ask} className="wf-stack">
                    <details>
                      <summary>Question interpretation</summary>
                      <label>
                        <input
                          type="checkbox"
                          checked={useInference}
                          onChange={(e) => Infer(e.target.checked)}
                        />{' '}
                        Allow a configured inference provider to interpret this question. Private
                        attachments are excluded. If unavailable, local retrieval continues.
                      </label>
                    </details>
                    <label>
                      Question
                      <textarea
                        value={q}
                        rows={3}
                        onChange={(e) => Q(e.target.value)}
                        placeholder="What is the rotor diameter?"
                      />
                    </label>
                    <div className="wf-actions">
                      <button className="primary" disabled={!!busy || q.trim().length < 2}>
                        Check evidence
                      </button>
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() =>
                          act('Finding relevant questions', async () => {
                            const r = await request<{ choices: string[]; source: string }>(
                              'suggest',
                              { model, component: part },
                            );
                            Choices(r.choices);
                            G(r.source);
                          })
                        }
                      >
                        Suggested questions
                      </button>
                    </div>
                  </form>
                  {choices.map((c) => (
                    <button
                      className="textbtn"
                      key={c}
                      onClick={() => {
                        Q(c);
                        if (c.includes('gearbox vibration')) S('grc');
                      }}
                    >
                      {c}
                    </button>
                  ))}
                  {answers
                    .slice()
                    .reverse()
                    .map((v, i) => (
                      <article key={i} className="wf-stack">
                        <hr />
                        <small>{v.type}</small>
                        <h3>{v.question}</h3>
                        <div className="wf-pre">{v.text}</div>
                        {v.citations.map((c, j) => (
                          <div className="source" key={j}>
                            <a href={c.url}>
                              {c.title} · {c.locator}
                            </a>
                            {c.text && <blockquote>{c.text}</blockquote>}
                          </div>
                        ))}
                        {v.gaps.map((g) => (
                          <p key={g}>{g}</p>
                        ))}
                        {v.record && (
                          <details>
                            <summary>Private record considered</summary>
                            <pre>{v.record}</pre>
                          </details>
                        )}
                      </article>
                    ))}
                  {answers.length > 0 && (
                    <div className="wf-actions">
                      <button
                        onClick={() =>
                          download(
                            'WindForge-investigation.json',
                            JSON.stringify(
                              { release: cat.release, model, component: part, report, answers },
                              null,
                              2,
                            ),
                            'application/json',
                          )
                        }
                      >
                        Export investigation
                      </button>
                      {report && (
                        <button onClick={() => exports('md')}>
                          Download comparison with evidence
                        </button>
                      )}
                    </div>
                  )}
                </section>
                <aside className="wf-panel">
                  <h2>Private maintenance evidence</h2>
                  <p>
                    Attach a text log, maintenance note or CSV extract to this component. Only this
                    browser workspace can retrieve it. Uploaded observations do not establish a
                    diagnosis.
                  </p>
                  <label>
                    Text or CSV file (up to 24 kB)
                    <input
                      type="file"
                      accept=".txt,.log,.csv,text/plain,text/csv"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f)
                          void act('Reading extract', async () => {
                            if (f.size > 24000)
                              throw Error('Choose an extract smaller than 24 kB.');
                            F(f.name);
                            N(await f.text());
                            RecordId('');
                          });
                      }}
                    />
                  </label>
                  <label>
                    Record title
                    <input value={filename} onChange={(e) => F(e.target.value)} />
                  </label>
                  <label>
                    Origin / asset / recording date
                    <input value={origin} onChange={(e) => O(e.target.value)} />
                  </label>
                  <label>
                    Observation or extract
                    <textarea rows={4} value={note} onChange={(e) => N(e.target.value)} />
                  </label>
                  <button
                    disabled={!!busy || !note.trim() || !origin.trim()}
                    onClick={() =>
                      act('Saving private evidence', async () => {
                        const x = await request<{ id: string }>('record', {
                          model,
                          component: part,
                          title: filename,
                          provenance: origin,
                          text: note,
                        });
                        RecordId(x.id);
                        await reload();
                        G('Private evidence attached to ' + n.label + '.');
                      })
                    }
                  >
                    Attach private record
                  </button>
                  {record && <small>Attached to the next question on this component.</small>}
                </aside>
              </div>
            )}
            {tab === 'Saved work' && (
              <section className="wf-panel" style={{ marginTop: 20 }}>
                <h2>Saved investigations</h2>
                <p>
                  Access is held by a private cookie in this browser. Export evidence you need to
                  retain before clearing browser data.
                </p>
                {!saved.length && (
                  <p>No saved work yet. Analyse a site or ask a question to start a record.</p>
                )}
                {saved.map((x) => (
                  <div key={x.id} className="wf-item">
                    <div>
                      <button className="textbtn" onClick={() => open(x)}>
                        {x.title}
                      </button>
                      <br />
                      <small>
                        {x.kind} · {new Date(x.created).toLocaleString()}
                      </small>
                    </div>
                    <button
                      onClick={() => {
                        if (window.confirm('Delete this private saved item?'))
                          void act('Removing item', async () => {
                            await request('remove', { id: x.id });
                            await reload();
                            if (rid === x.id) {
                              R(null);
                              RI('');
                            }
                            if (sid === x.id) {
                              SI('');
                              Site(null);
                            }
                            G('Saved item removed.');
                          });
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
        <footer className="wf-foot">
          <span>Reference designs for preliminary engineering investigation.</span>{' '}
          <a href="https://github.com/weegienamja/WindForge">Repository</a>
          {' · '}
          <a href="https://github.com/weegienamja/WindForge/tree/main/packages/mcp">MCP setup</a>
          {' · '}
          <Link href="/reanalysis">Wind reanalysis</Link>
          {' · '}
          <Link href="/about">Site screening guide</Link>
        </footer>
      </div>
    </main>
  );
}
