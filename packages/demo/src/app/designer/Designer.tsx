'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { designerTurbine } from '../../lib/designer/turbines';
import { useState, useEffect } from 'react';
import {
  DEFAULT_FINANCIAL_PARAMS as finance,
  polygonAreaSqKm,
  type LatLng,
} from '@jamieblair/windforge-core';
import {
  checkedBoundary,
  EXAMPLE,
  MAX_LAYOUTS,
  MAX_TURBINES,
  newLayout,
  rounded,
  samePoint,
  siteKey,
  validPoint,
  validSite,
  type Layout,
} from '../../lib/designer/project';
import { useProject, useResults } from './useProject';
import type { Tool } from './FarmMap';
import ParcelScreen from './ParcelScreen';
import Compare, { fmt } from './Compare';
import { Coordinates, LayoutInputs } from './Inputs';
const MapView = dynamic(() => import('./FarmMap'), {
  ssr: false,
  loading: () => <div className="farm-map farm-map-loading">Loading map…</div>,
});
const hints: Record<Tool, string> = {
  select: 'Select a turbine to inspect it. Drag a turbine or receptor to move it.',
  place: 'Click the map to add turbines to this layout.',
  receptor: 'Click the map to place the shared receptor.',
  boundary: 'Click each corner of the parcel, then finish the boundary.',
};
function siteUrl(p: LatLng) {
  return '?lat=' + p.lat + '&lng=' + p.lng;
}
export default function Designer() {
  const { project, setProject, savedSites, storage, refreshEvidence, fetching, evidenceStatus } =
    useProject();
  const comparison = useResults(project);
  const [tool, setTool] = useState<Tool>('select'),
    [selected, select] = useState<number | null>(null);
  const [draft, setDraft] = useState<LatLng[]>([]),
    [frame, setFrame] = useState(0),
    [notice, setNotice] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(true);
  useEffect(() => {
    setSettingsOpen(!window.matchMedia('(max-width: 650px)').matches);
  }, []);
  if (!project) return <p role="status">Opening design workspace…</p>;
  const p = project,
    layout = p.layouts.find((l) => l.id === p.active)!,
    idx = p.layouts.indexOf(layout),
    result = comparison.results?.[idx];
  const machine = designerTurbine(layout.turbineId)!;
  const site = siteKey(p.site),
    example = samePoint(p.site, EXAMPLE);
  const setLayout = (change: Partial<Layout>, price = p.price) =>
    setProject({
      ...p,
      price,
      layouts: p.layouts.map((l) => (l.id === layout.id ? { ...l, ...change } : l)),
    });
  function resetTools() {
    select(null);
    setTool('select');
    setDraft([]);
    setNotice('');
  }
  function activate(id: string) {
    resetTools();
    setProject({ ...p, active: id });
  }
  function addLayout(copy: boolean) {
    if (p.layouts.length >= MAX_LAYOUTS) return;
    const fresh = newLayout('Layout ' + (p.layouts.length + 1));
    const next = copy
      ? {
          ...layout,
          id: fresh.id,
          name: layout.name.slice(0, 44) + ' copy',
          positions: [...layout.positions],
        }
      : fresh;
    resetTools();
    setProject({ ...p, active: next.id, layouts: [...p.layouts, next] });
    if (!copy) setTool('place');
  }
  function startTool(next: Tool) {
    setTool(next);
    setDraft([]);
    setNotice('');
  }
  function move(i: number, v: LatLng) {
    if (!validPoint(v)) return;
    select(i);
    setLayout({ positions: layout.positions.map((pos, j) => (j === i ? rounded(v) : pos)) });
  }
  function placeReceptor(v: LatLng) {
    if (!validPoint(v)) return;
    setProject({ ...p, receptor: rounded(v) });
    setTool('select');
  }
  function pick(v: LatLng) {
    if (!validPoint(v)) return;
    const at = rounded(v);
    setNotice('');
    if (tool === 'place') {
      if (layout.positions.length === MAX_TURBINES) {
        setNotice('This layout already has 32 turbines.');
        return;
      }
      select(layout.positions.length);
      setLayout({ positions: [...layout.positions, at] });
    } else if (tool === 'receptor') placeReceptor(at);
    else if (tool === 'boundary') {
      if (draft.length === 64) {
        setNotice('Finish the boundary with up to 64 corners.');
        return;
      }
      setDraft([...draft, at]);
    } else select(null);
  }
  function finishBoundary() {
    try {
      const boundary = checkedBoundary(draft, p.site);
      setProject({ ...p, boundary, screen: undefined });
      resetTools();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Check the boundary corners.');
    }
  }
  const coords = tool === 'select' && selected !== null ? layout.positions[selected] : undefined;
  const point = coords ?? (tool === 'receptor' ? p.receptor : null) ?? p.site;
  const e = p.evidence;
  return (
    <>
      <div className="farm-location">
        <div>
          <span className="farm-locator" aria-hidden="true">
            ⌖
          </span>
          <strong>{example ? 'Caithness example' : 'Design site'}</strong>
          <span className="farm-coord">
            {p.site.lat.toFixed(4)}°, {p.site.lng.toFixed(4)}°
          </span>
        </div>
        <details className="farm-switch">
          <summary>Change site</summary>
          <div>
            <Coordinates
              point={p.site}
              action="Open site"
              onApply={(at) => {
                if (!validSite(at)) {
                  setNotice('Choose a site between 84° S and 84° N and within ±179.8° longitude.');
                  return;
                }
                location.assign('/designer' + siteUrl(rounded(at)));
              }}
            />
            {[...new Set([siteKey(EXAMPLE), ...savedSites])]
              .filter((k) => k !== site)
              .map((k) => {
                const [lat, lng] = k.split(',').map(Number) as [number, number];
                return (
                  <a key={k} href={'/designer' + siteUrl({ lat, lng })}>
                    {k === siteKey(EXAMPLE) ? 'Caithness study site' : k}
                  </a>
                );
              })}
          </div>
        </details>
        <span className="farm-storage">{storage}</span>
      </div>
      <div className="farm-workspace">
        <aside className="farm-sidebar" aria-label="Layout controls">
          <h2>Layouts</h2>
          <div className="farm-layout-list">
            {p.layouts.map((l, i) => (
              <button
                type="button"
                key={l.id}
                aria-pressed={l.id === p.active}
                onClick={() => activate(l.id)}
              >
                <span className="farm-letter">{String.fromCharCode(65 + i)}</span>
                <span>{l.name}</span>
                <small>{l.positions.length}</small>
              </button>
            ))}
          </div>
          <div className="farm-actions">
            <button
              type="button"
              disabled={p.layouts.length >= MAX_LAYOUTS}
              onClick={() => addLayout(false)}
            >
              + New layout
            </button>
            <button
              type="button"
              disabled={p.layouts.length >= MAX_LAYOUTS}
              onClick={() => addLayout(true)}
            >
              Duplicate
            </button>
          </div>
          <details
            className="farm-machine"
            open={settingsOpen}
            onToggle={(ev) => setSettingsOpen(ev.currentTarget.open)}
          >
            <summary>Turbine specification</summary>
            <LayoutInputs key={layout.id} layout={layout} price={p.price} onApply={setLayout} />
            <p className="farm-spec">
              {machine.rotorDiameterM} m rotor · {fmt(machine.ratedPowerKw / 1000, 2)} MW per
              turbine
              <br />
              {machine.basis}
            </p>
            {p.layouts.length > 1 && (
              <details className="farm-delete">
                <summary>Remove layout</summary>
                <p>Remove {layout.name} and its turbines from this browser?</p>
                <button
                  type="button"
                  onClick={() => {
                    const rest = p.layouts.filter((l) => l.id !== p.active);
                    resetTools();
                    setProject({ ...p, layouts: rest, active: rest[0]!.id });
                  }}
                >
                  Confirm removal
                </button>
              </details>
            )}
          </details>
        </aside>
        <section className="farm-editor" aria-label="Parcel editor">
          <div className="farm-chart-head">
            <div>
              <span className="farm-chart-kicker">Parcel plan</span>
              <h2>{layout.name}</h2>
            </div>
            <span className="farm-area">{fmt(polygonAreaSqKm(p.boundary), 2)} km²</span>
          </div>
          <div className="farm-tools" role="group" aria-label="Map tools">
            {(
              [
                ['select', 'Select / move'],
                ['place', '+ Turbine'],
                ['receptor', 'Receptor'],
                ['boundary', 'Draw parcel'],
              ] as const
            ).map(([id, text]) => (
              <button
                key={id}
                type="button"
                aria-pressed={tool === id}
                onClick={() => startTool(id)}
              >
                {text}
              </button>
            ))}
            <button className="farm-fit" type="button" onClick={() => setFrame((n) => n + 1)}>
              Fit view
            </button>
          </div>
          <div className="farm-map-wrap">
            <MapView
              project={p}
              layout={layout}
              tool={tool}
              selected={selected}
              draft={draft}
              frame={frame}
              onPick={pick}
              onMove={move}
              onSelect={(i) => {
                setTool('select');
                select(i);
              }}
              onReceptor={placeReceptor}
            />
            {e?.wind && (
              <div className="farm-bearing">
                <b
                  aria-hidden="true"
                  style={{ transform: 'rotate(' + (e.wind.prevailingDirectionDeg + 180) + 'deg)' }}
                >
                  ↑
                </b>{' '}
                Wind from {fmt(e.wind.prevailingDirectionDeg)}°
              </div>
            )}
          </div>
          <div className="farm-map-foot">
            <span>{hints[tool]}</span>
            <strong>
              <i /> Parcel <i /> Receptor{' '}
              {p.screen && (
                <>
                  <i className="farm-zone-key" /> Exclusion
                </>
              )}
            </strong>
          </div>
          {tool === 'boundary' && (
            <div className="farm-inline">
              <span>{draft.length} corners</span>
              <button type="button" disabled={draft.length < 3} onClick={finishBoundary}>
                Finish boundary
              </button>
              <button
                type="button"
                disabled={!draft.length}
                onClick={() => setDraft(draft.slice(0, -1))}
              >
                Undo corner
              </button>
              <button type="button" onClick={() => startTool('select')}>
                Cancel
              </button>
            </div>
          )}
          <div className="farm-inspection">
            <label className="farm-picker">
              Turbine position
              <select
                aria-label="Select turbine"
                value={selected ?? ''}
                onChange={(ev) => {
                  startTool('select');
                  select(ev.target.value === '' ? null : Number(ev.target.value));
                }}
              >
                <option value="">Choose turbine</option>
                {layout.positions.map((v, i) => (
                  <option value={i} key={i}>
                    T{i + 1} · {v.lat.toFixed(4)}, {v.lng.toFixed(4)}
                  </option>
                ))}
              </select>
            </label>
            {(tool !== 'select' || coords) && (
              <details key={tool + '-' + selected} className="farm-point">
                <summary>{coords ? 'Edit coordinates' : 'Enter coordinates'}</summary>
                <Coordinates
                  key={siteKey(point)}
                  point={point}
                  action={
                    coords
                      ? 'Move turbine'
                      : tool === 'place'
                        ? 'Place turbine'
                        : tool === 'boundary'
                          ? 'Add corner'
                          : 'Place receptor'
                  }
                  onApply={(v) => (coords && selected !== null ? move(selected, v) : pick(v))}
                />
              </details>
            )}
            {coords && selected !== null && (
              <button
                type="button"
                className="farm-text-btn"
                onClick={() => {
                  setLayout({ positions: layout.positions.filter((_, i) => i !== selected) });
                  select(null);
                }}
              >
                Remove T{selected + 1}
              </button>
            )}
            {tool === 'receptor' && p.receptor && (
              <button
                type="button"
                onClick={() => {
                  setProject({ ...p, receptor: null });
                  startTool('select');
                }}
              >
                Clear receptor
              </button>
            )}
          </div>
          {notice && (
            <p className="farm-notice" role="status">
              {notice}
            </p>
          )}
          <div className="farm-stats">
            <div>
              <span>Installed capacity</span>
              <strong>
                {fmt((layout.positions.length * machine.ratedPowerKw) / 1000, 1)} <small>MW</small>
              </strong>
            </div>
            <div>
              <span>Net annual energy</span>
              <strong>
                {fmt(result?.energy)} <small>MWh</small>
              </strong>
            </div>
            <div>
              <span>Wake loss</span>
              <strong>
                {fmt(result?.wake, 2)} <small>%</small>
              </strong>
            </div>
          </div>
        </section>
      </div>
      <ParcelScreen
        key={JSON.stringify(p.boundary)}
        project={p}
        onResult={(screen) =>
          setProject((current) =>
            current?.boundary === p.boundary ? { ...current, screen } : current,
          )
        }
      />
      <Compare project={p} {...comparison} />
      <details className="farm-evidence">
        <summary>Site evidence &amp; modelling assumptions</summary>
        <div className="farm-evidence-grid">
          <section>
            <h3>Site screen</h3>
            {e ? (
              <>
                <p>
                  {e.source || 'Wind unavailable'} · {e.at.slice(0, 10)}. Site score{' '}
                  {e.score === null ? 'withheld' : e.score + '/100'}. {e.detail}
                </p>
                {e.wind && (
                  <p>
                    {fmt(e.wind.annualAverageSpeedMs, 2)} m/s at {e.wind.referenceHeightM ?? 50} m
                    over {e.wind.dataYears} years. Shear exponent {e.shear}.
                  </p>
                )}
                {e.alerts.length > 0 && (
                  <ul>
                    {e.alerts.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p>Site evidence is pending. The layout can be edited while data loads.</p>
            )}
            <p role="status">{fetching ? 'Retrieving site evidence…' : evidenceStatus}</p>
            <div className="farm-actions">
              <button type="button" onClick={refreshEvidence} disabled={fetching}>
                Refresh evidence
              </button>
              <Link href={'/analyse' + siteUrl(p.site)}>Full site analysis ↗</Link>
            </div>
          </section>
          <section>
            <h3>Engineering &amp; finance</h3>
            <p>
              The site score describes the site point. The parcel check uses mapped features and
              screening setbacks. Statutory boundaries and permissions need independent
              verification.
            </p>
            <p>
              Jensen/Park wakes use every turbine position. IEA designs use their published power
              and thrust tables. Commercial library models use illustrative power curves, with
              thrust derived from power. Energy uses sea-level air density. Sound uses library rated
              sound power and mixed ground. Shadow uses hourly astronomical samples for 2025 at a 2
              m receptor and can miss shorter events.
            </p>
            <p>
              Finance uses {finance.projectLifeYears} operating years, {finance.constructionYears}{' '}
              construction years, {finance.discountRate * 100}% discount,{' '}
              {finance.inflationRate * 100}% inflation and {finance.degradationRatePercent * 100}%
              annual degradation. UK onshore costs are editable per layout.
            </p>
          </section>
        </div>
      </details>
    </>
  );
}
