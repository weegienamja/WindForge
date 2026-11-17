import { summariseRecord } from '../../../lib/engineering/records';
import { interpret } from '../../../lib/engineering/inference';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import {
  analyseSite,
  createBoundary,
  fetchConstraintData,
  detectConstraints,
  type SiteAnalysis,
} from '@jamieblair/windforge-core';
import {
  InputError,
  calculate,
  fail,
  object,
  options,
  point,
  ring,
} from '../../../lib/engineering/calculate';
import { answer } from '../../../lib/engineering/assistant';
import { verifiedSite } from '../../../lib/engineering/ticket';
import type { Catalogue, Report, Geometry, Passage, Answer } from '../../../lib/engineering/types';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;
type Binding = { request: (req: unknown) => Promise<{ data?: unknown; error?: string }> };
async function rpc<T>(op: string, args: unknown = {}, owner = '', key = ''): Promise<T> {
  const ctx = getCloudflareContext();
  const b = (ctx.env as unknown as { WF_KNOWLEDGE: Binding }).WF_KNOWLEDGE;
  const r = await b.request({ op, args, owner, key });
  if (r.error) throw new Error('Knowledge storage unavailable');
  return r.data as T;
}
const noStore = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
function reply(body: unknown, status = 200, token?: string) {
  const r = Response.json(body, { status, headers: noStore });
  if (token)
    r.headers.set(
      'set-cookie',
      '__Host-wf=' + token + '; Max-Age=15552000; Path=/; Secure; HttpOnly; SameSite=Strict',
    );
  return r;
}
async function hash(x: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(x))),
    (v) => v.toString(16).padStart(2, '0'),
  ).join('');
}
function label(x: unknown, def: string) {
  if (x === undefined || x === '') return def;
  if (typeof x !== 'string' || x.trim().length < 1 || x.length > 120)
    throw new InputError('Use a title of 1–120 characters.');
  return x.trim();
}
function id(x: unknown) {
  if (
    typeof x !== 'string' ||
    !/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(x)
  )
    throw new InputError('Invalid saved item.');
  return x;
}
async function body(req: Request) {
  const r = req.body?.getReader();
  if (!r) throw new InputError('Missing JSON body.');
  let size = 0;
  const chunks = [];
  while (true) {
    const x = await r.read();
    if (x.done) break;
    size += x.value.length;
    if (size > 128000) {
      await r.cancel();
      throw new InputError('Request exceeds 128 kB.');
    }
    chunks.push(x.value);
  }
  const b = new Uint8Array(size);
  let i = 0;
  for (const chunk of chunks) {
    b.set(chunk, i);
    i += chunk.length;
  }
  try {
    return object(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(b)));
  } catch {
    throw new InputError('Invalid JSON.');
  }
}
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  try {
    if (params.has('library') || params.has('blade')) {
      const release = params.get('release') ?? '';
      if (!/^[a-f0-9]{16}$/.test(release))
        return reply({ error: 'Invalid library revision.' }, 400);
      if (params.has('library')) return reply(await rpc('library', { release }));
      const model = params.get('blade');
      if (!['iea34', 'iea15', 'iea22'].includes(model ?? ''))
        return reply({ error: 'Unknown blade.' }, 400);
      const geometry = await rpc('blade', { model, release });
      return geometry
        ? reply(geometry)
        : reply({ error: 'No blade geometry in this revision.' }, 404);
    }
    return reply(await rpc(params.has('status') ? 'status' : 'catalogue'));
  } catch {
    const { bundledEvidence } = await import('../../../lib/engineering/bundled-evidence');
    const snapshot = await bundledEvidence(params);
    if (snapshot) return reply(snapshot);
    return reply({ error: 'Engineering library temporarily unavailable.' }, 503);
  }
}
interface Item<T> {
  id: string;
  kind: string;
  title: string;
  content: T;
}
export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  if (
    (origin && origin !== new URL(req.url).origin) ||
    req.headers.get('sec-fetch-site') === 'cross-site' ||
    !req.headers.get('content-type')?.startsWith('application/json')
  )
    return reply({ error: 'Same-origin JSON required.' }, 403);
  try {
    const a = await body(req),
      op = String(a.op);
    const allowed = [
      'site',
      'compare',
      'ask',
      'journal',
      'list',
      'get',
      'remove',
      'record',
      'suggest',
      'recalculate',
    ];
    if (!allowed.includes(op)) return reply({ error: 'Unknown operation.' }, 400);
    const old = req.headers.get('cookie')?.match(/(?:^|; )__Host-wf=([a-f0-9]{64})(?:;|$)/)?.[1];
    const token = old ?? (crypto.randomUUID() + crypto.randomUUID()).replaceAll('-', '');
    const owner = await hash(token);
    const send = (x: unknown, status = 200) => reply(x, status, old ? undefined : token);
    const expensive = ['site', 'compare', 'recalculate', 'record', 'suggest'].includes(op);
    const cap = expensive ? 50 : 240;
    if (
      !(await rpc(
        'quota',
        { cap },
        '',
        await hash(
          [req.headers.get('cf-connecting-ip') ?? 'local', expensive ? 'write' : 'read'].join('/'),
        ),
      ))
    )
      return send({ error: 'Hourly request limit reached.' }, 429);
    const saved = <T>(key: unknown) => rpc<Item<T> | null>('get', { id: id(key) }, owner);
    const store = (kind: string, title: string, content: unknown) =>
      rpc<string>('save', { kind, title, content }, owner);
    if (op === 'journal') return send(await rpc('journal', { id: id(a.id) }, owner));
    if (op === 'list') return send(await rpc('list', {}, owner));
    if (op === 'get') {
      const item = await saved(a.id);
      return item ? send(item) : send({ error: 'Item not found in this workspace.' }, 404);
    }
    if (op === 'remove') {
      return (await rpc('delete', { id: id(a.id) }, owner))
        ? send({ removed: true })
        : send({ error: 'Item not found.' }, 404);
    }
    if (op === 'site') {
      const coordinate = point(a.coordinate);
      let site: SiteAnalysis;
      if (a.site && (await verifiedSite(a.site, a.signature))) {
        site = a.site as SiteAnalysis;
        if (site.coordinate.lat !== coordinate.lat || site.coordinate.lng !== coordinate.lng)
          fail('Site evidence does not match coordinates.');
      } else {
        const r = await analyseSite({
          coordinate,
          hubHeightM: 100,
          signal: AbortSignal.timeout(45000),
        });
        if (!r.ok) return send({ error: r.error.message }, 502);
        site = r.value;
      }
      const key = await store(
        'site',
        label(a.title, 'Site ' + coordinate.lat + ', ' + coordinate.lng),
        site,
      );
      return send({ id: key, site });
    }
    const cat = await rpc<Catalogue>('catalogue');
    const model = (x: unknown) =>
      cat.models.find((m) => m.id === x) ?? fail('Unknown reference design.');
    if (op === 'record') {
      const m = model(a.model);
      const n = m.nodes.find((p) => p.id === a.component) ?? fail('Unknown component.');
      if (
        typeof a.text !== 'string' ||
        a.text.trim().length < 2 ||
        a.text.length > 24000 ||
        a.text.includes('\0')
      )
        fail('Use a text, CSV or log extract up to 24,000 characters.');
      const record = {
        model: m.id,
        component: n.id,
        release: cat.release,
        sha256: await hash(String(a.text)),
        text: a.text,
        provenance: label(a.provenance, 'User supplied (origin unspecified)'),
        summary: summariseRecord(String(a.title ?? ''), String(a.text)),
        verified: false,
      };
      return send({ id: await store('record', label(a.title, 'Maintenance extract'), record) });
    }
    if (op === 'suggest') {
      const m = model(a.model),
        n = m.nodes.find((n) => n.id === a.component) ?? fail('Unknown component.');
      const choices = [
        'Show component specifications',
        'What is the rotor diameter?',
        'Compare net energy yield',
        'Investigate gearbox vibration',
      ];
      const url = process.env.WF_INFERENCE_URL,
        modelId = process.env.WF_INFERENCE_MODEL;
      if (!url || !modelId) return send({ source: 'Structured suggestions', choices });
      try {
        if (!url.startsWith('https://')) throw new Error();
        const res = await fetch(url, {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(5000),
          headers: {
            'content-type': 'application/json',
            ...(process.env.WF_INFERENCE_TOKEN
              ? { authorization: 'Bearer ' + process.env.WF_INFERENCE_TOKEN }
              : {}),
          },
          body: JSON.stringify({
            model: modelId,
            temperature: 0,
            max_tokens: 12,
            messages: [
              {
                role: 'user',
                content:
                  'Rank these question indices by relevance to ' +
                  m.name +
                  ' / ' +
                  n.label +
                  ': ' +
                  JSON.stringify(choices) +
                  '. Reply only with a JSON array of four indices 0 to 3.',
              },
            ],
          }),
        });
        if (!res.ok) throw new Error();
        const obj = (await res.json()) as { choices?: { message: { content: string } }[] };
        const order: unknown = JSON.parse(obj.choices?.[0]?.message.content ?? '');
        if (
          !Array.isArray(order) ||
          order.length !== 4 ||
          new Set(order).size !== 4 ||
          !order.every((i) => Number.isInteger(i) && i >= 0 && i < 4)
        )
          throw new Error();
        return send({
          source: 'Inference-ranked suggestions',
          choices: order.map((i) => choices[i]),
        });
      } catch {
        return send({ source: 'Inference unavailable · structured suggestions', choices });
      }
    }
    let previous: Report | null = null;
    if (a.reportId) {
      const s = await saved<Report>(a.reportId);
      if (!s || s.kind !== 'comparison') return send({ error: 'Comparison not found.' }, 404);
      previous = s.content;
    }
    if (op === 'ask') {
      const q = String(a.question ?? '').trim();
      if (q.length < 2 || q.length > 500) fail('Enter a question of 2–500 characters.');
      const m = previous?.models.find((m) => m.id === a.model) ?? model(a.model),
        n = m.nodes.find((p) => p.id === a.component) ?? fail('Unknown component.');
      const scope = String(a.scope ?? m.id);
      if (![m.id, 'schema', 'method', 'grc'].includes(scope)) fail('Invalid evidence scope.');
      let record: string | undefined;
      if (a.recordId) {
        const s = await saved<{
          text: string;
          model: string;
          component: string;
          sha256: string;
          summary?: string;
          provenance?: string;
        }>(a.recordId);
        if (
          !s ||
          s.kind !== 'record' ||
          typeof s.content.text !== 'string' ||
          s.content.model !== m.id ||
          s.content.component !== n.id
        )
          return send({ error: 'No matching private component record.' }, 404);
        record =
          s.title +
          ' · unverified user record · ' +
          s.content.sha256.slice(0, 12) +
          '\n' +
          (s.content.provenance ?? '') +
          '\n' +
          (s.content.summary ?? '') +
          '\n' +
          s.content.text.slice(0, 700);
      }
      const sources = {
        ...cat.sources,
        ...Object.fromEntries((previous?.sources ?? []).map((s) => [s.id, s])),
      };
      let result: Answer = await answer(
        q,
        m,
        n,
        sources,
        previous,
        scope,
        (q, scope) => rpc<Passage[]>('search', { q, scope }),
        record,
      );
      if (result.type === 'Unresolved' && !result.gaps.length && scope === m.id) {
        if (a.useInference === true && !a.recordId) {
          const plan = await interpret(q, m.name, n.label, !!previous);
          if (plan) {
            const candidate = await answer(plan, m, n, sources, previous, scope, (q, scope) =>
              rpc('search', { q, scope }),
            );
            if (candidate.type !== 'Unresolved')
              result = {
                ...candidate,
                text: 'Interpreted question: ' + plan + '\n' + candidate.text,
                gaps: [
                  ...candidate.gaps,
                  'The optional inference service selected the question only. Check that its interpretation matches your intent.',
                ],
              };
          }
        }
        if (result.type === 'Unresolved' && (!previous || previous.release === cat.release)) {
          const near = await rpc<{
            field: string;
            value: unknown;
            unit: string;
            locator: string;
            line: number | null;
            source: { title: string; url: string };
          } | null>('relatedFact', { q, model: m.id, component: n.id });
          if (near)
            result.citations.unshift({
              title: near.source.title,
              url: near.source.url + (near.line ? '#L' + near.line : ''),
              locator: near.locator,
              text:
                'Related structured field (not a verified answer): ' +
                near.field +
                ' = ' +
                String(near.value) +
                ' ' +
                near.unit,
            });
        }
      }
      if (previous && ['Calculated result', 'Interpretation'].includes(result.type))
        result.citations.unshift({
          title: 'Saved comparison',
          url: '/engineering?item=' + id(a.reportId),
          locator: previous.created + ' · ' + previous.engine,
        });
      if (record) {
        result.record = record;
        result.citations.push({
          title: 'Private component record',
          url: '/engineering?item=' + id(a.recordId),
          locator: 'User-supplied observation; see the attached extract',
        });
      }
      const entry = { ...result, release: cat.release, question: q, reportId: a.reportId ?? null };
      await store('record', q.slice(0, 110), {
        entryType: 'answer',
        answer: entry,
        reportId: a.reportId ?? null,
        model: m.id,
        component: n.id,
      });
      return send(entry);
    }
    let siteId = a.siteId,
      configs = a.configs,
      geometry: Geometry | null = null,
      setting = String(a.setting ?? 'unknown'),
      receptor = a.receptor == null ? null : point(a.receptor);
    if (op === 'recalculate') {
      if (!previous) throw new InputError('Select a comparison first.');
      if (previous.release !== cat.release)
        fail('Library changed. Run a new comparison before varying this one.');
      const text = String(a.question ?? '')
        .toLowerCase()
        .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/g, (w) =>
          String(
            [
              '',
              'one',
              'two',
              'three',
              'four',
              'five',
              'six',
              'seven',
              'eight',
              'nine',
              'ten',
            ].indexOf(w),
          ),
        );
      const match = text.match(
        /(?:replace|compare)\s+(\d+)\s+(?:smaller\s+)?turbines?\s+(?:with|to|and)\s+(\d+)\s+(?:larger\s+)?(?:ones|turbines?)\b/,
      );
      if (!match)
        throw new InputError(
          'Use “replace six turbines with four turbines”, or edit the two configurations.',
        );
      siteId = previous.siteId;
      configs = previous.cases.map((v, i) => ({ ...v.config, count: Number(match[i + 1]) }));
      geometry = previous.geometry;
      setting = previous.setting;
      receptor = previous.receptor;
    }
    const s =
      previous && op === 'recalculate'
        ? { kind: 'site', content: previous.site }
        : await saved<SiteAnalysis>(siteId);
    if (!s || s.kind !== 'site') return send({ error: 'Select a saved site.' }, 404);
    if (!Array.isArray(configs) || configs.length !== 2)
      throw new InputError('Supply two configurations.');
    const cfg = configs.map((v) => options(v, cat.models));
    if (!['onshore', 'offshore', 'unknown'].includes(setting)) fail('Unknown site setting.');
    if (a.boundary && op === 'compare') {
      const polygon = ring(a.boundary, s.content.coordinate),
        b = createBoundary(polygon);
      const r = await fetchConstraintData(b, AbortSignal.timeout(40000));
      geometry = {
        ring: polygon,
        zones: r.ok ? detectConstraints(b, r.value).exclusionZones : null,
        source: r.ok ? 'OpenStreetMap via Overpass' : r.error.message,
        retrieved: new Date().toISOString(),
        stamp: r.ok ? (r.value.osmBaseTimestamp ?? null) : null,
      };
    }
    if (!geometry && cfg.some((c) => c.sector !== 'whole'))
      fail('A boundary is required to compare west and east.');
    const cases = cfg.map((c) =>
      calculate(s.content, model(c.model), c, geometry, receptor, setting),
    );
    const models = cat.models.filter((m) => cfg.some((c) => c.model === m.id));
    const en = cases.map((c) => c.energy?.netTotalAepMwh);
    const report: Report = {
      engine:
        'windforge-screen/1.0.0 (core 0.3.0), Worker ' +
        ((getCloudflareContext().env as unknown as { WF_VERSION?: { id: string } }).WF_VERSION
          ?.id ?? 'local'),
      release: cat.release,
      created: new Date().toISOString(),
      site: s.content,
      siteId: id(siteId),
      geometry,
      setting,
      receptor,
      cases,
      models,
      sources: Object.values(cat.sources).filter(
        (v) => models.some((m) => m.id === v.scope) || !cat.models.some((m) => m.id === v.scope),
      ),
      deltaMwh: en[0] != null && en[1] != null ? en[1] - en[0] : null,
    };
    return send({
      id: await store('comparison', label(a.title, 'Configuration comparison'), report),
      report,
    });
  } catch (e) {
    return reply(
      {
        error:
          e instanceof InputError
            ? e.message
            : 'Engineering service unavailable. Your previous investigations are unchanged.',
      },
      e instanceof InputError ? 400 : 503,
    );
  }
}
