import { useState, type ReactNode } from 'react';
import type { Catalogue, EngineeringNote, Model, Part } from '../../lib/engineering/types';
import { download } from './report';

const ink = '#29494c',
  steel = '#9bb8ae',
  accent = '#237b6d',
  copper = '#b97b47';
const radial = (cx: number, cy: number, r: number, i: number, n: number) => [
  cx + r * Math.cos((2 * Math.PI * i) / n),
  cy + r * Math.sin((2 * Math.PI * i) / n),
];
function Gear({ x, y, r, teeth = 18 }: { x: number; y: number; r: number; teeth?: number }) {
  const points = Array.from({ length: teeth * 4 }, (_, i) =>
    radial(x, y, i % 4 === 0 || i % 4 === 3 ? r * 0.88 : r, i, teeth * 4).join(','),
  ).join(' ');
  return (
    <g>
      <polygon points={points} stroke={ink} strokeWidth="1.6" />
      <circle cx={x} cy={y} r={r * 0.23} fill="#f2f5f0" stroke={ink} />
    </g>
  );
}
function Hot({ name, go, children }: { name: string; go: () => void; children: ReactNode }) {
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={'Inspect ' + name}
      className="wf-hot"
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go();
        }
      }}
    >
      {children}
    </g>
  );
}
function Tag({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <text className="wf-label" x={x} y={y} textAnchor="middle">
      {text}
    </text>
  );
}
function Drawing({ name, children }: { name: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 580 245" className="wf-machine-plate" role="group" aria-label={name}>
      <title>{name}</title>
      {children}
    </svg>
  );
}
export function MachineDiagram({
  m,
  n,
  select,
}: {
  m: Model;
  n: Part;
  select: (id: string) => void;
}) {
  const [detail, setDetail] = useState(0);
  const geared = m.nodes.some((p) => p.id === 'gearbox');
  if (n.id === 'drivetrain') {
    return (
      <Drawing name="Nacelle cutaway">
        <path
          d="M25 165V89Q34 52 83 49H450Q522 49 550 90l12 75Z"
          fill="#dce9e1"
          stroke="#91aaa1"
          strokeWidth="2"
        />
        <path d="M30 179h526m-323 0-8 49h36l-4-49" stroke={ink} fill={steel} strokeWidth="5" />
        <path d="M5 114h510v15H5z" fill={ink} />
        <Hot name="main bearings" go={() => select('other_components')}>
          <rect x="54" y="91" width="84" height="61" rx="6" fill={steel} stroke={ink} />
          {[65, 110].map((x) => (
            <g key={x}>
              <rect x={x} y="96" width="16" height="51" rx="5" fill={ink} />
              <path d={'M' + (x + 3) + ' 103l9 9m-9 16 9 9'} stroke="white" strokeWidth="3" />
            </g>
          ))}
          <path d="M91 151v38" className="leader" />
          <Tag x={90} y={207} text="Main bearings" />
        </Hot>
        {geared && (
          <Hot name="gearbox" go={() => select('gearbox')}>
            <rect x="175" y="77" width="124" height="78" rx="9" fill="#d7c3a9" stroke={ink} />
            <g fill={copper}>
              <Gear x={210} y={111} r={25} />
              <Gear x={249} y={115} r={18} />
            </g>
            <path d="M238 77V51" className="leader" />
            <Tag x={237} y={41} text="Gearbox" />
          </Hot>
        )}
        <Hot name="generator" go={() => select('generator')}>
          <rect
            x={geared ? 360 : 182}
            y={geared ? 84 : 69}
            width={geared ? 126 : 273}
            height={geared ? 72 : 90}
            rx="12"
            fill={accent}
            stroke={ink}
          />
          {Array.from({ length: 8 }, (_, i) => (
            <path
              key={i}
              d={'M' + ((geared ? 373 : 204) + i * (geared ? 13 : 31)) + ' 91v53'}
              stroke="#bed6c7"
              strokeWidth="4"
            />
          ))}
          <path d={'M' + (geared ? 425 : 328) + ' 155v34'} className="leader" />
          <Tag x={geared ? 425 : 328} y={207} text="Generator" />
        </Hot>
      </Drawing>
    );
  }
  if (n.id === 'gearbox' || n.id === 'gear-stages') {
    const config = m.nodes
      .find((p) => p.id === 'gearbox')
      ?.facts.find((f) => f.field === 'gear_configuration')?.value;
    const counts = m.nodes
      .find((p) => p.id === 'gearbox')
      ?.facts.find((f) => f.field === 'planet_numbers')?.value;
    const layout = typeof config === 'string' ? config.toLowerCase().split('') : [];
    return (
      <>
        <Drawing name="Gearbox stages and shaft bearings">
          <path
            d="M18 57Q27 43 53 43H529Q559 43 563 74v96H18Z"
            fill="#e3e9df"
            stroke="#95a99e"
            strokeWidth="2"
          />
          <path d="M3 111h572" stroke={ink} strokeWidth="10" />
          {layout.map((s, i) => {
            const x = 105 + i * 160;
            const planets = Array.isArray(counts) ? counts[i] : 0;
            return (
              <Hot
                name={'stage ' + (i + 1)}
                go={() => {
                  if (n.id !== 'gear-stages') select('gear-stages');
                  setDetail(i);
                }}
                key={i}
              >
                <rect
                  x={x - 62}
                  y="52"
                  width="124"
                  height="127"
                  rx="8"
                  fill={n.id === 'gear-stages' && i === detail ? '#c5ded1' : 'transparent'}
                />
                {s === 'e' ? (
                  <>
                    <circle cx={x} cy="110" r="48" fill="#bdccc0" stroke={ink} strokeWidth="5" />
                    <circle cx={x} cy="110" r="41" fill="#f3f4eb" stroke={ink} />
                    <g fill={copper}>
                      <Gear x={x} y={110} r={16} />
                    </g>
                    {Array.from({ length: planets ?? 0 }, (_, j) => {
                      const [px, py] = radial(x, 110, 28, j, planets!);
                      return (
                        <g key={j} fill={steel}>
                          <Gear x={px!} y={py!} r={15} teeth={12} />
                        </g>
                      );
                    })}
                  </>
                ) : (
                  <g fill={copper}>
                    <Gear x={x - 13} y={105} r={33} />
                    <Gear x={x + 29} y={121} r={17} />
                  </g>
                )}
                <Tag x={x} y={197} text={i + 1 + ' · ' + (s === 'e' ? 'Planetary' : 'Parallel')} />
              </Hot>
            );
          })}
          <Hot name="gearbox bearings" go={() => select('gearbox-bearings')}>
            <rect x="508" y="83" width="30" height="57" rx="4" fill={ink} stroke="#fff" />
            <path d="M514 93l18 14m-18 11 18 13" stroke={steel} strokeWidth="5" />
            <path d="M525 143v55" className="leader" />
            <Tag x={524} y={219} text="Bearings" />
          </Hot>
        </Drawing>
        {n.id === 'gear-stages' && layout[detail] && (
          <p className="wf-mech-reading">
            <strong>Stage {detail + 1}</strong> ·{' '}
            {layout[detail] === 'e'
              ? 'Epicyclic stage, ' +
                (Array.isArray(counts) ? counts[detail] : 'unreported') +
                ' planets in the definition.'
              : 'Parallel-shaft stage in the reference definition.'}{' '}
            Tooth counts and dimensions are illustrative.
          </p>
        )}
      </>
    );
  }
  if (['gearbox-bearings', 'other_components', 'mb1', 'mb2'].includes(n.id)) {
    const descriptions = [
      [
        'Outer ring',
        'The outer raceway provides the opposing contact surface for the rolling elements.',
      ],
      ['Rolling elements', 'The rollers carry load between the two raceways as the shaft turns.'],
      ['Inner ring', 'The inner raceway transmits shaft load into the rolling contacts.'],
    ];
    return (
      <>
        <Drawing name="Bearing operating principle">
          <g transform="translate(0 6)">
            <Hot name="outer ring" go={() => setDetail(0)}>
              <circle
                cx="184"
                cy="112"
                r="91"
                fill={detail === 0 ? accent : steel}
                stroke={ink}
                strokeWidth="2"
              />
              <circle cx="184" cy="112" r="75" fill="#e9f0e9" />
              <path d="M259 62l44-22h63" className="leader" />
              <text x="375" y="45">
                Outer ring
              </text>
            </Hot>
            <Hot name="rolling elements" go={() => setDetail(1)}>
              {Array.from({ length: 12 }, (_, i) => {
                const [x, y] = radial(184, 112, 63, i, 12);
                return (
                  <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r="12"
                    stroke={ink}
                    strokeWidth="2"
                    fill={detail === 1 ? copper : '#cfb491'}
                  />
                );
              })}
              <path d="M253 109h113" className="leader" />
              <text x="375" y="113">
                Rolling elements
              </text>
            </Hot>
            <Hot name="inner ring" go={() => setDetail(2)}>
              <circle
                cx="184"
                cy="112"
                r="50"
                fill={detail === 2 ? accent : steel}
                stroke={ink}
                strokeWidth="2"
              />
              <circle cx="184" cy="112" r="32" fill="#eff4ef" stroke={ink} />
              <path d="M218 141l84 48h64" className="leader" />
              <text x="375" y="193">
                Inner ring
              </text>
            </Hot>
          </g>
        </Drawing>
        <div className="wf-actions wf-subparts">
          {descriptions.map(([name], i) => (
            <button key={name} aria-pressed={i === detail} onClick={() => setDetail(i)}>
              {name}
            </button>
          ))}
        </div>
        <p>{descriptions[detail]?.[1]}</p>
      </>
    );
  }
  if (['generator', 'generator-rotor', 'generator-stator'].includes(n.id)) {
    return (
      <Drawing name="Generator electromagnetic section">
        <Hot name="stator and windings" go={() => select('generator-stator')}>
          <circle
            cx="177"
            cy="122"
            r="97"
            fill={n.id === 'generator-stator' ? accent : steel}
            stroke={ink}
            strokeWidth="3"
          />
          <circle cx="177" cy="122" r="74" fill="#ecf3ec" />
          {Array.from({ length: 16 }, (_, i) => {
            const [x, y] = radial(177, 122, 74, i, 16);
            return (
              <ellipse
                key={i}
                cx={x}
                cy={y}
                rx="6"
                ry="11"
                transform={'rotate(' + ((360 * i) / 16 + 90) + ' ' + x + ' ' + y + ')'}
                fill={copper}
                stroke="#765237"
              />
            );
          })}
          <path d="M254 59l48-17h56" className="leader" />
          <text x="369" y="47">
            Stator and windings
          </text>
        </Hot>
        <Hot name="generator rotor" go={() => select('generator-rotor')}>
          <circle
            cx="177"
            cy="122"
            r="58"
            fill={n.id === 'generator-rotor' ? accent : '#789c90'}
            stroke={ink}
            strokeWidth="2"
          />
          <circle cx="177" cy="122" r="17" fill={ink} />
          <path
            d="M141 129a37 37 0 0 1 51-42m-2-8 6 10-12 1"
            stroke="white"
            strokeWidth="2.5"
            fill="none"
          />
          <path d="M219 150l83 31h56" className="leader" />
          <text x="369" y="186">
            Rotor
          </text>
        </Hot>
        <text x="310" y="225">
          Functional section · radial view
        </text>
      </Drawing>
    );
  }
  return null;
}

export function MachineNav({ m, n, select }: { m: Model; n: Part; select: (id: string) => void }) {
  const parents: Part[] = [];
  let parent = m.nodes.find((v) => v.id === n.parent);
  while (parent) {
    parents.unshift(parent);
    parent = m.nodes.find((v) => v.id === parent?.parent);
  }
  const children = m.nodes.filter((v) => v.parent === n.id);
  return (
    <div className="wf-machine-nav">
      <nav aria-label="Assembly path">
        {parents.map((v) => (
          <span key={v.id}>
            <button className="textbtn" onClick={() => select(v.id)}>
              {v.label}
            </button>
            {' / '}
          </span>
        ))}
        <strong aria-current="location">{n.label}</strong>
      </nav>
      {children.length > 0 && (
        <div className="wf-actions wf-children" aria-label="Contained parts">
          {children.map((v) => (
            <button key={v.id} onClick={() => select(v.id)}>
              {v.label} ›
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Guide({
  n,
  m,
  cat,
  ask,
}: {
  n: Part;
  m: Model;
  cat: Catalogue;
  ask: (q: string) => void;
}) {
  const [index, choose] = useState(0);
  const guide = n.machinery;
  if (!guide) return null;
  const item = guide.cases[index]!;
  const cite = (note: EngineeringNote) => {
    const s = cat.sources[note.source];
    return (
      <p>
        {note.text}{' '}
        {s && (
          <a href={s.url} target="_blank" rel="noreferrer">
            {s.title} ↗
          </a>
        )}
      </p>
    );
  };
  return (
    <section className="wf-guide">
      <div>
        <small>{guide.basis}</small>
        <h3>How it works</h3>
        {cite(guide.how)}
      </div>
      <div>
        <h3>What can go wrong</h3>
        <div className="wf-actions wf-subparts">
          {guide.cases.map((c, i) => (
            <button key={c.title} aria-pressed={i === index} onClick={() => choose(i)}>
              {c.title}
            </button>
          ))}
        </div>
      </div>
      <div className="wf-case-note" aria-live="polite">
        <h4>{item.title}</h4>
        {cite(item.finding)}
        <h4>Evidence to compare</h4>
        {cite(item.inspect)}
        <small>{item.scope}</small>
      </div>
      <div className="wf-actions">
        <button onClick={() => ask('Investigate ' + item.title + ' for this component.')}>
          Investigate this finding
        </button>
        <button
          onClick={() => {
            const refs = [guide.how.source, item.finding.source, item.inspect.source, n.source];
            download(
              m.id + '-' + n.id + '-finding.json',
              JSON.stringify(
                {
                  model: m.name,
                  revision: m.revision,
                  release: cat.release,
                  component: n.label,
                  basis: guide.basis,
                  principle: guide.how,
                  finding: item,
                  specifications: n.facts,
                  sources: [...new Set(refs)].map((id) => cat.sources[id]),
                },
                null,
                2,
              ),
              'application/json',
            );
          }}
        >
          Export finding
        </button>
      </div>
    </section>
  );
}
