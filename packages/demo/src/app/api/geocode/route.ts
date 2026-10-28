/**
 * Server-side geocoding proxy for the analyse page.
 *
 * Two modes:
 *   GET /api/geocode?q=Stornoway        → forward search (place name → coords)
 *   GET /api/geocode?lat=58.2&lng=-6.4   → reverse lookup (coords → place name)
 *
 * Proxying through the server lets us send a descriptive `User-Agent` (required
 * by the Nominatim usage policy — browsers forbid setting it) and keeps the
 * upstream endpoint out of the client bundle. Results are cached at the edge.
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'WindForge/0.3 (+https://github.com/weegienamja/WindForge)';

// Cache successful lookups for a day — place geometry does not move.
export const revalidate = 86_400;

export interface GeocodeHit {
  displayName: string;
  lat: number;
  lng: number;
  /** OSM feature class, e.g. "place", "boundary". */
  category: string;
  /** Short label good for a chip, e.g. "Stornoway, Scotland". */
  label: string;
}

function shortLabel(displayName: string): string {
  // Nominatim display names are long ("Stornoway, Western Isles, Scotland, UK").
  // Keep the first and last two components for a compact, readable chip.
  const parts = displayName
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 3) return parts.join(', ');
  return [parts[0], parts[parts.length - 2], parts[parts.length - 1]].join(', ');
}

function coordinateNumber(value: unknown, limit: number): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}

function geocodeHit(value: unknown): GeocodeHit | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const lat = coordinateNumber(row.lat, 90);
  const lng = coordinateNumber(row.lon, 180);
  if (
    lat === null ||
    lng === null ||
    typeof row.display_name !== 'string' ||
    !row.display_name.trim()
  )
    return null;
  return {
    displayName: row.display_name,
    lat,
    lng,
    category: typeof row.category === 'string' ? row.category : '',
    label: shortLabel(row.display_name),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control':
        status === 200
          ? `public, s-maxage=${revalidate}, stale-while-revalidate=${revalidate}`
          : 'private, no-store, max-age=0',
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');

  try {
    if (q) {
      if (q.length < 2) return jsonResponse({ results: [] });
      if (q.length > 120) return jsonResponse({ error: 'Query is too long' }, 400);
      const url = `${NOMINATIM}/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=6&addressdetails=0`;
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return jsonResponse({ error: `Nominatim ${res.status}` }, 502);
      const raw: unknown = await res.json();
      if (!Array.isArray(raw)) return jsonResponse({ error: 'Invalid geocoding response' }, 502);
      const results = raw.map(geocodeHit).filter((hit): hit is GeocodeHit => hit !== null);
      return jsonResponse({ results });
    }

    if (lat !== null && lng !== null) {
      const latN = coordinateNumber(lat, 90);
      const lngN = coordinateNumber(lng, 180);
      if (latN === null || lngN === null) {
        return jsonResponse({ error: 'Invalid coordinate' }, 400);
      }
      const url = `${NOMINATIM}/reverse?lat=${latN}&lon=${lngN}&format=jsonv2&zoom=10`;
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return jsonResponse({ error: `Nominatim ${res.status}` }, 502);
      const data: unknown = await res.json();
      if (
        !data ||
        typeof data !== 'object' ||
        !('display_name' in data) ||
        typeof data.display_name !== 'string' ||
        !data.display_name.trim()
      ) {
        return jsonResponse({ error: 'Invalid geocoding response' }, 502);
      }
      const displayName = data.display_name;
      return jsonResponse({ displayName, label: shortLabel(displayName) });
    }

    return jsonResponse({ error: 'Provide ?q= or ?lat=&lng=' }, 400);
  } catch (error) {
    // DOMException can come from a different realm and need not satisfy instanceof Error.
    const timedOut =
      error !== null &&
      typeof error === 'object' &&
      'name' in error &&
      error.name === 'TimeoutError';
    return jsonResponse(
      { error: timedOut ? 'Geocode request timed out' : 'Geocode request failed' },
      timedOut ? 504 : 502,
    );
  }
}
