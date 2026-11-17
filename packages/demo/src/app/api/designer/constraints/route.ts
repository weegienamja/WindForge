import { createBoundary, detectConstraints, fetchConstraintData } from '@jamieblair/windforge-core';
import { InputError, point, ring } from '../../../../lib/engineering/calculate';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams,
    parcel = query.get('parcel') ?? '',
    site = query.get('site') ?? '';
  if (parcel.length > 4500 || site.length > 128)
    return reply({ error: 'Parcel coordinates are too large.' }, 400);
  try {
    const polygon = ring(
      { type: 'Polygon', coordinates: [JSON.parse(parcel)] },
      point(JSON.parse(site)),
    );
    const boundary = createBoundary(polygon);
    const data = await fetchConstraintData(
      boundary,
      AbortSignal.any([request.signal, AbortSignal.timeout(40000)]),
    );
    if (!data.ok)
      return reply({ error: 'Parcel evidence unavailable. ' + data.error.message }, 502);
    const report = detectConstraints(boundary, data.value);
    return reply({
      at: new Date().toISOString(),
      zones: report.exclusionZones,
      summary: report.summary.reasoning,
    });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof InputError)
      return reply({ error: error.message }, 400);
    return reply({ error: 'The parcel constraint check could not be completed.' }, 502);
  }
}
