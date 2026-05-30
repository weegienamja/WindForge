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
const USER_AGENT = 'WindForge/0.3 (+https://wind.jamieblair.co.uk)';

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
  const parts = displayName.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 3) return parts.join(', ');
  return [parts[0], parts[parts.length - 2], parts[parts.length - 1]].join(', ');
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, s-maxage=${revalidate}, stale-while-revalidate=${revalidate}`,
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
      const url = `${NOMINATIM}/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=6&addressdetails=0`;
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return jsonResponse({ error: `Nominatim ${res.status}` }, 502);
      const raw = (await res.json()) as Array<{
        display_name?: string;
        lat?: string;
        lon?: string;
        category?: string;
      }>;
      const results: GeocodeHit[] = raw
        .map((r) => ({
          displayName: r.display_name ?? '',
          lat: Number(r.lat),
          lng: Number(r.lon),
          category: r.category ?? '',
          label: shortLabel(r.display_name ?? ''),
        }))
        .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng) && r.displayName);
      return jsonResponse({ results });
    }

    if (lat !== null && lng !== null) {
      const latN = Number(lat);
      const lngN = Number(lng);
      if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
        return jsonResponse({ error: 'Invalid coordinate' }, 400);
      }
      const url = `${NOMINATIM}/reverse?lat=${latN}&lon=${lngN}&format=jsonv2&zoom=10`;
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return jsonResponse({ error: `Nominatim ${res.status}` }, 502);
      const data = (await res.json()) as { display_name?: string };
      const displayName = data.display_name ?? '';
      return jsonResponse({ displayName, label: shortLabel(displayName) });
    }

    return jsonResponse({ error: 'Provide ?q= or ?lat=&lng=' }, 400);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Geocode request failed';
    return jsonResponse({ error: message }, 500);
  }
}
