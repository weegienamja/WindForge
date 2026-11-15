import type { Answer, Model, Part, Passage, Report, Source } from './types';
const clean = (s: string) =>
  s
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const rejected =
  /\b(repair|replace.*part|compatible|authoris|certif|guarantee|probability|remaining life|will it fail|safe to|torque setting|ignore .*instruct)/i;
export async function answer(
  q: string,
  m: Model,
  n: Part,
  sources: Record<string, Source>,
  report: Report | null,
  scope: string,
  search: (q: string, scope: string) => Promise<Passage[]>,
  record?: string,
): Promise<Answer> {
  const a: Answer = {
    type: 'Unresolved',
    text: 'No applicable record establishes an answer to this question.',
    citations: [],
    gaps: [],
  };
  if (rejected.test(q)) {
    a.gaps.push(
      'A reference model or research test cannot validate replacement compatibility, diagnose this asset or authorise maintenance. Obtain asset-specific documentation and qualified review.',
    );
    return a;
  }
  if (report && /what if|what changes if|suppose|instead of|substitute/i.test(q)) {
    return {
      ...a,
      text: 'That change needs a new calculation. Edit the configuration controls, or ask “replace six turbines with four turbines” to recalculate the two selected models.',
      gaps: ['The saved results describe only their original inputs.'],
    };
  }
  if (
    report &&
    /promising|trade.?off|better fit|recommend|more suitable|which configuration/i.test(q)
  ) {
    const [left, right] = report.cases;
    const delta = report.deltaMwh;
    return {
      ...a,
      type: 'Interpretation',
      text:
        delta === null
          ? 'The evidence does not support an energy ranking for both configurations.'
          : (delta === 0
              ? 'Both configurations give the same screening yield.'
              : (delta > 0 ? 'B' : 'A') +
                ' gives the larger screening yield by ' +
                Math.abs(delta).toLocaleString('en-GB', { maximumFractionDigits: 0 }) +
                ' MWh/year.') +
            ' Installed capacities are ' +
            left!.capacityMw +
            ' MW and ' +
            right!.capacityMw +
            ' MW. Higher total output alone cannot establish site fit.',
      citations: report.sources
        .filter((s) => report.models.some((m) => m.performance === s.id))
        .map((s) => ({
          title: s.title,
          url: s.url,
          locator: 'Saved comparison · ' + report.created,
        })),
      gaps: [...new Set(report.cases.flatMap((c) => c.gaps))],
    };
  }
  if (
    scope === 'grc' &&
    /vibrat|bearing|gear|oil|damage|rpm|monitor|symptom|chatter|rumbl|noise/i.test(q)
  ) {
    const found = await search(q, 'grc');
    if (!found.length) return a;
    return {
      ...a,
      type: 'Research evidence',
      text: 'A research comparison can help distinguish load-related vibration from a possible drivetrain fault. The studies concern their own test gearboxes; they do not identify a fault on this turbine.',
      citations: found.map((p) => ({
        title: p.source.title,
        url: p.source.url,
        locator: p.locator,
        text: p.text,
      })),
      gaps: [
        'Obtain timestamped vibration channels with sensor location and units, shaft RPM, operating load and an inspection or oil-event history for the particular asset.',
      ],
      record,
    };
  }
  if (
    /\b(yield|aep|energy|capacity factor|wake loss|cost|lcoe|flicker|noise|access|output)\b/i.test(
      q,
    ) &&
    report
  ) {
    const metric = /noise/i.test(q)
      ? 'noise'
      : /lcoe|cost/i.test(q)
        ? 'lcoe'
        : /flicker/i.test(q)
          ? 'shadow'
          : /wake/i.test(q)
            ? 'wake'
            : /access/i.test(q)
              ? 'access'
              : /capacity factor/i.test(q)
                ? 'cf'
                : 'energy';
    const lines = report.cases.map((c, i) => {
      let v: string | number | null = null;
      let unit = '';
      if (metric === 'noise') {
        v = c.noiseDba ?? null;
        unit = 'dBA';
      }
      if (metric === 'energy') {
        v = c.energy?.netTotalAepMwh ?? null;
        unit = 'MWh/year';
      }
      if (metric === 'lcoe') {
        v = c.lcoe;
        unit = 'GBP/MWh';
      }
      if (metric === 'shadow') {
        v = c.shadowHours;
        unit = 'theoretical hours/year';
      }
      if (metric === 'wake') {
        v = c.energy?.losses.wakeLossPct ?? null;
        unit = '%';
      }
      if (metric === 'cf') {
        v = c.energy ? 100 * c.energy.netCapacityFactor : null;
        unit = '%';
      }
      if (metric === 'access') v = c.basis.find((x) => x.startsWith('Access screen:')) ?? null;
      return (
        (i === 0 ? 'A · ' : 'B · ') +
        c.label +
        ': ' +
        (v === null
          ? 'withheld'
          : typeof v === 'number'
            ? v.toLocaleString('en-GB', { maximumFractionDigits: 2 }) + ' ' + unit
            : v)
      );
    });
    return {
      ...a,
      type:
        metric === 'noise' && report.cases.every((c) => c.noiseDba == null)
          ? 'Unresolved'
          : 'Calculated result',
      text: lines.join('\n'),
      citations: report.sources
        .filter((s) => report.models.some((m) => m.performance === s.id))
        .map((s) => ({
          title: s.title,
          url: s.url,
          locator: 'Comparison ' + report.created + ' · ' + report.engine,
        })),
      gaps: [...new Set(report.cases.flatMap((c) => c.gaps))],
    };
  }
  if (scope === m.id && n.function && /function|purpose|what does/i.test(q)) {
    const s = sources['doe-functions'];
    if (s)
      return {
        ...a,
        type: 'Documented fact',
        text: n.function,
        citations: [
          { title: s.title, url: s.url, locator: 'How turbines work · ' + n.id },
          {
            title: m.name,
            url: sources[n.source]!.url + (n.line ? '#L' + n.line : ''),
            locator: n.path,
          },
        ],
        gaps: ['General function; the reference definition identifies the selected assembly.'],
      };
  }
  if (scope === m.id) {
    const norm = clean(q);
    const alias: Record<string, string> = {
      'gearbox ratio': 'gear ratio',
      'transmission ratio': 'gear ratio',
      'rated capacity': 'rated power',
      'rated output': 'rated power',
      'hub elevation': 'hub height',
      'rotor span': 'rotor diameter',
      weight: 'mass',
      'blade count': 'number of blades',
    };
    let term = norm;
    for (const [x, y] of Object.entries(alias)) term = term.replace(x, y);
    const nodes = [
      n,
      ...m.nodes.filter(
        (p) => p.id !== n.id && (p.id === 'assembly' || term.includes(clean(p.label))),
      ),
    ];
    for (const p of nodes) {
      const fs = p.facts.filter(
        (f) =>
          term.includes(clean(f.field)) ||
          (/specification|specs|properties|describe/.test(term) && p.id === n.id),
      );
      if (!fs.length) continue;
      const s = sources[p.source]!;
      return {
        ...a,
        type: 'Documented fact',
        text:
          m.name +
          ' · ' +
          p.label +
          '\n' +
          fs
            .map((f) => f.field.replaceAll('_', ' ') + ': ' + String(f.value) + ' ' + f.unit)
            .join('\n'),
        citations: fs.map((f) => ({
          title: s.title,
          url: s.url + (f.line ? '#L' + f.line : ''),
          locator: f.path,
        })),
        gaps: ['Reference design value; applicability to any installed machine is unverified.'],
      };
    }
    if (
      /function|what does|what is|purpose/i.test(q) &&
      n.description &&
      clean(q)
        .split(' ')
        .some((k) => k.length > 3 && clean(n.label).includes(k))
    ) {
      const s = sources['windio-schema']!;
      return {
        ...a,
        type: 'Documented fact',
        text: n.description,
        citations: [{ title: s.title, url: s.url, locator: n.path }],
        gaps: ['Schema definition, not manufacturer service information.'],
      };
    }
  }
  const found = await search(q, scope);
  a.citations = found.map((p) => ({
    title: p.source.title,
    url: p.source.url,
    locator: p.locator,
    text: p.text,
  }));
  a.text = found.length
    ? 'Related source passages were found. They are available for inspection; a direct answer has not been established.'
    : a.text;
  return a;
}
