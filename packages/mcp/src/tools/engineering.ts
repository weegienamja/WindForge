import { z } from 'zod';
import { toolSuccess, toolError, registerTool, type ToolDefinition } from './types.js';
const base = 'https://windforge.khmer-iq.workers.dev/api/engineering';
let cookie = '';
type CatalogueReply = {
  release: string;
  models: { id: string; name: string; drive: string; setting: string; ratedKw: number }[];
  sources: Record<string, unknown>;
};
async function api<T = unknown>(op?: string, data: Record<string, unknown> = {}) {
  const r = await fetch(base, {
    method: op ? 'POST' : 'GET',
    redirect: 'error',
    headers: op ? { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } : {},
    ...(op ? { body: JSON.stringify({ op, ...data }) } : {}),
    signal: AbortSignal.timeout(80000),
  });
  const session = r.headers.get('set-cookie')?.split(';')[0];
  if (session) cookie = session;

  if (!r.ok) {
    const x = (await r
      .clone()
      .json()
      .catch(() => ({}))) as { error?: string };
    throw new Error(typeof x.error === 'string' ? x.error : 'Engineering service unavailable');
  }
  return (await r.json()) as T;
}
function define<T extends z.ZodTypeAny>(
  name: string,
  description: string,
  inputSchema: T,
  fn: (v: z.infer<T>) => Promise<unknown>,
) {
  const tool: ToolDefinition<T> = {
    name,
    description,
    inputSchema,
    handler: async (v) => {
      try {
        return toolSuccess(await fn(v));
      } catch (e) {
        return toolError(
          'ENGINEERING_UNAVAILABLE',
          e instanceof Error ? e.message : 'Engineering service unavailable',
        );
      }
    },
  };
  return registerTool(tool);
}
const model = z.enum(['iea34', 'iea15', 'iea22']);
const point = z
  .object({ lat: z.number().min(-89.5).max(89.5), lng: z.number().min(-180).max(180) })
  .strict();
const config = z
  .object({
    model,
    count: z.number().int().min(1).max(32),
    hub: z.number().positive().max(300),
    wake: z.number().min(0).max(50).default(8),
    sector: z.enum(['whole', 'west', 'east']).default('whole'),
    soundDba: z.number().positive().max(160).nullable().optional(),
    soundSource: z.string().max(300).optional(),
    capex: z.number().positive().nullable().default(null),
    opex: z.number().positive().nullable().default(null),
  })
  .strict();
export const engineeringTools = [
  define(
    'engineering_catalogue',
    'Inspect the versioned IEA reference models, documented components and source locators. Use when selecting a sourced reference design before comparison. Input: optional model ID. Output: release and available models, or the selected model, components, power curve and source records.',
    z.object({ model: model.optional() }).strict(),
    async (v) => {
      const c = await api<CatalogueReply>();
      return v.model
        ? {
            release: c.release,
            model: c.models.find((m: { id: string }) => m.id === v.model),
            sources: c.sources,
          }
        : {
            release: c.release,
            models: c.models.map(
              (m: {
                id: string;
                name: string;
                drive: string;
                setting: string;
                ratedKw: number;
              }) => ({
                id: m.id,
                name: m.name,
                drive: m.drive,
                setting: m.setting,
                ratedKw: m.ratedKw,
              }),
            ),
          };
    },
  ),
  define(
    'engineering_question',
    'Query structured component records, scoped research passages or a saved comparison from this MCP process. Numerical answers come from source fields or saved calculations. Use when a user asks about source-backed specifications or a saved result. Inputs: question, model, component, optional scope and comparison ID. Output: classified answer, source locators and unresolved evidence gaps. Saves a private question record.',
    z
      .object({
        model,
        component: z.string().max(64).default('assembly'),
        scope: z.enum(['iea34', 'iea15', 'iea22', 'grc', 'method', 'schema']).optional(),
        question: z.string().min(2).max(500),
        reportId: z.string().uuid().optional(),
      })
      .strict(),
    (v) => api('ask', v),
  ),
  define(
    'engineering_compare',
    'Retrieve fresh site evidence and calculate two reference turbine configurations. Accepts an optional GeoJSON parcel and receptor. Returns a private, versioned report including gaps; a point alone cannot establish layout fit. Use when comparing rated capacity, yield, wakes, access or receptor effects. Inputs: coordinate, two configurations, optional polygon and receptor. Output: snapshot ID and reproducible report.',
    z
      .object({
        coordinate: point,
        configs: z.tuple([config, config]),
        setting: z.enum(['onshore', 'offshore', 'unknown']).default('unknown'),
        boundary: z
          .object({
            type: z.literal('Polygon'),
            coordinates: z
              .array(
                z
                  .array(z.tuple([z.number(), z.number()]))
                  .min(4)
                  .max(65),
              )
              .length(1),
          })
          .optional(),
        receptor: point.optional(),
      })
      .strict(),
    async (v) => {
      const s = await api<{ id: string }>('site', { coordinate: v.coordinate });
      return api('compare', { ...v, siteId: s.id });
    },
  ),
  define(
    'engineering_recalculate',
    'Re-run a stored comparison using its original site evidence and geometry with new turbine counts, for example replace six turbines with four turbines. Use when changing counts without re-fetching the site or modifying the earlier result. Input: comparison ID and replacement question. Output: new snapshot ID, both recalculated cases, evidence and limitations.',
    z.object({ reportId: z.string().uuid(), question: z.string().max(180) }).strict(),
    (v) => api('recalculate', v),
  ),
];
