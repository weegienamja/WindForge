import { z } from 'zod';
import {
  createBoundary,
  detectConstraints,
  fetchConstraintData,
  type LatLng,
} from '@jamieblair/windforge-core';
import { polygonSchema } from './shared.js';
import { toolError, toolSuccess, type ToolDefinition } from './types.js';

const inputSchema = z
  .object({
    polygon: polygonSchema,
    name: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe('Optional human-readable label attached to the boundary in the response.'),
  })
  .strict();

export const detectConstraintsTool: ToolDefinition<typeof inputSchema> = {
  name: 'detect_constraints',
  description:
    'Run only the constraints check for a polygon boundary, without doing the full scoring run. The engine ' +
    "fetches OpenStreetMap data via Overpass for the boundary's bounding box, categorises configured screening exclusions " +
    '(protected areas, military zones, airports, dwellings inside the parcel), soft constraints (residential ' +
    'buffers, water, forest, infrastructure setbacks), and informational features, and returns nearest-receptor ' +
    'distances (dwelling, settlement, protected area, substation, road, existing wind farm, waterbody, railway). ' +
    'Use when the user wants a fast supplementary OSM constraint screen before a formal data search, ' +
    'or when they want to see why a previous assessment flagged screening exclusions. ' +
    'Inputs: `polygon` is an ordered array of `{lat, lng}` vertices, minimum 3; `name` labels the boundary. ' +
    'Output: a `SiteConstraintReport` with categorised screening constraints and a nearest-feature distance table. OSM coverage is not authoritative. ' +
    'Latency: 5-20s (Overpass cold; ~24h cache once warm).',
  inputSchema,
  handler: async (input) => {
    const polygon: LatLng[] = input.polygon.map((p) => ({ lat: p.lat, lng: p.lng }));
    const boundary = createBoundary(polygon, input.name);

    const osm = await fetchConstraintData(boundary);
    if (!osm.ok) {
      return toolError(osm.error.code, osm.error.message, osm.error.cause);
    }
    const report = detectConstraints(boundary, osm.value);
    return toolSuccess({ boundary, report });
  },
};
