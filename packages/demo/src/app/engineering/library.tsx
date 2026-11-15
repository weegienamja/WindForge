import { useState } from 'react';
import type { Catalogue } from '../../lib/engineering/types';
import { usePublicEvidence } from './public-evidence';
import { download } from './report';

interface Entry {
  id: string;
  source: string;
  locator: string;
  text: string;
}
const scopes: Record<string, string> = {
  grc: 'Gearbox Reliability Collaborative',
  method: 'Engineering methods',
  schema: 'windIO schema',
};
export function SourceLibrary({
  cat,
  investigate,
}: {
  cat: Catalogue;
  investigate: (scope: string) => void;
}) {
  const result = usePublicEvidence<Entry[]>('library=1&release=' + cat.release);
  const [term, search] = useState(''),
    [scope, filter] = useState('all'),
    [selected, select] = useState('grc-cracks');
  const terms = term.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const match = (text: string) => terms.every((t) => text.toLowerCase().includes(t));
  const entries = result?.data ?? [];
  const names = { ...scopes, ...Object.fromEntries(cat.models.map((m) => [m.id, m.name])) };
  const sources = Object.values(cat.sources)
    .filter((s) => scope === 'all' || s.scope === scope)
    .map((s) => {
      const all = entries.filter((p) => p.source === s.id);
      const rows = match(s.title + ' ' + s.id + ' ' + names[s.scope])
        ? all
        : all.filter((p) => match(p.text + ' ' + p.locator + ' ' + s.title));
      return {
        s,
        rows,
        visible: rows.length > 0 || match(s.title + ' ' + s.id + ' ' + names[s.scope]),
      };
    })
    .filter((v) => v.visible)
    .sort((a, b) => a.s.title.localeCompare(b.s.title));
  const active = sources.find((v) => v.s.id === selected) ?? sources[0],
    src = active?.s;
  return (
    <section className="wf-blades">
      <div className="wf-blade-heading">
        <div>
          <h2>Source library</h2>
          <p>Search the reference definitions, research annotations and engineering methods.</p>
        </div>
      </div>
      <div className="wf-grid wf-library">
        <section className="wf-panel">
          <label>
            Search sources and passages
            <input
              value={term}
              onChange={(e) => search(e.target.value)}
              type="search"
              placeholder="Bearing, blade, BeamDyn…"
            />
          </label>
          <label>
            Collection
            <select value={scope} onChange={(e) => filter(e.target.value)}>
              <option value="all">All collections</option>
              {Object.entries(names).map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>
          </label>
          <small aria-live="polite">{sources.length} matching sources</small>
          <div className="wf-source-list">
            {sources.map(({ s }) => (
              <button key={s.id} aria-pressed={s.id === src?.id} onClick={() => select(s.id)}>
                <small>{names[s.scope]}</small>
                {s.title}
              </button>
            ))}
          </div>
        </section>
        <article className="wf-panel" aria-live="polite">
          {src && active ? (
            <>
              <small>{names[src.scope]}</small>
              <h3>{src.title}</h3>
              <div className="wf-actions">
                <a href={src.url}>Open original source ↗</a>
                {src.license !== src.url && <a href={src.license}>Reuse terms ↗</a>}
              </div>
              {result?.error ? (
                <p role="alert">{result.error}</p>
              ) : !result ? (
                <p role="status">Loading indexed passages…</p>
              ) : active.rows.length ? (
                active.rows.map((p) => (
                  <section className="wf-passage" key={p.id}>
                    <h4>{p.locator}</h4>
                    <p>{p.text}</p>
                  </section>
                ))
              ) : (
                <p>This record contains source metadata. Open the original for its contents.</p>
              )}
              <small>
                Revision {src.revision} · {src.terms}
              </small>
              <div className="wf-actions">
                <button onClick={() => investigate(src.scope)}>Investigate this collection</button>
                <button
                  disabled={!result?.data}
                  onClick={() =>
                    download(
                      src.id + '-evidence.json',
                      JSON.stringify(
                        { release: cat.release, source: src, passages: active.rows },
                        null,
                        2,
                      ),
                      'application/json',
                    )
                  }
                >
                  Export selected evidence
                </button>
              </div>
            </>
          ) : (
            <p>No sources match this search.</p>
          )}
        </article>
      </div>
    </section>
  );
}
