import {
  fetchElevationData,
  fetchGridInfrastructure,
  fetchWindData,
  reverseGeocode,
  validateEra5ApiKey,
} from '@jamieblair/windforge-core';

/**
 * Developer health probe. Hits one minimal endpoint per upstream and reports
 * latency plus pass/fail per source. Not exposed in product UI; used during
 * manual launch verification (see PRE-PUBLISH-CHECKLIST.md, Block 3).
 *
 * Streams a JSON array progressively so a slow Overpass cannot hide a fast
 * NASA POWER pass.
 */

const PROBE_COORD = { lat: 55.86, lng: -4.25 } as const;

// 60-second cache. A single fast call per source per minute is the right
// ceiling for what is intended to be a manual aid, not a polled monitor.
export const revalidate = 60;

interface SourceResult {
  source: string;
  status: 'ok' | 'fail';
  latencyMs: number;
  error?: string;
}

async function timeIt(label: string, run: () => Promise<{ ok: boolean; error?: string }>): Promise<SourceResult> {
  const start = Date.now();
  try {
    const { ok, error } = await run();
    const latencyMs = Date.now() - start;
    return ok
      ? { source: label, status: 'ok', latencyMs }
      : { source: label, status: 'fail', latencyMs, error: error ?? 'unknown failure' };
  } catch (err) {
    return {
      source: label,
      status: 'fail',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

const probes: Array<() => Promise<SourceResult>> = [
  () =>
    timeIt('nasa-power', async () => {
      const result = await fetchWindData(PROBE_COORD);
      return result.ok
        ? { ok: true }
        : { ok: false, error: result.error.message };
    }),
  () =>
    timeIt('open-elevation', async () => {
      const result = await fetchElevationData(PROBE_COORD);
      return result.ok
        ? { ok: true }
        : { ok: false, error: result.error.message };
    }),
  () =>
    timeIt('overpass', async () => {
      const result = await fetchGridInfrastructure(PROBE_COORD);
      return result.ok
        ? { ok: true }
        : { ok: false, error: result.error.message };
    }),
  () =>
    timeIt('nominatim', async () => {
      const result = await reverseGeocode(PROBE_COORD);
      return result.ok
        ? { ok: true }
        : { ok: false, error: result.error.message };
    }),
  () =>
    timeIt('cds', async () => {
      const apiKey = process.env.CDS_API_KEY;
      if (!apiKey) {
        return { ok: false, error: 'CDS_API_KEY not set; skipped' };
      }
      const result = await validateEra5ApiKey(apiKey);
      return result.ok
        ? { ok: true }
        : { ok: false, error: result.error.message };
    }),
];

export async function GET(): Promise<Response> {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode('['));
      let first = true;
      // Kick off all probes in parallel and emit each one as soon as it
      // settles, regardless of original order. A slow Overpass must not
      // delay the visible status of a fast NASA POWER.
      let remaining = probes.length;
      await new Promise<void>((resolve) => {
        if (remaining === 0) {
          resolve();
          return;
        }
        for (const probe of probes) {
          probe()
            .catch((err): SourceResult => ({
              source: 'unknown',
              status: 'fail',
              latencyMs: 0,
              error: err instanceof Error ? err.message : String(err),
            }))
            .then((payload) => {
              controller.enqueue(
                encoder.encode((first ? '' : ',') + JSON.stringify(payload)),
              );
              first = false;
              remaining -= 1;
              if (remaining === 0) resolve();
            });
        }
      });
      controller.enqueue(encoder.encode(']'));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, s-maxage=${revalidate}, stale-while-revalidate=${revalidate}`,
    },
  });
}
