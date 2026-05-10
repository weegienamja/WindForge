import { z } from 'zod';
import {
  assessSite,
  createBoundary,
  getTurbineById,
  type LatLng,
} from '@jamieblair/windforge-core';
import { polygonSchema, hubHeightSchema, weightsSchema } from './shared.js';
import { toolError, toolSuccess, type ToolDefinition } from './types.js';

const inputSchema = z
  .object({
    polygon: polygonSchema,
    name: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe('Optional human-readable site name to attach to the resulting boundary.'),
    hubHeightM: hubHeightSchema.optional(),
    turbineId: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Optional turbine model id (see `list_turbines`). When provided, the engine also returns an AEP estimate ' +
          'and rotor-spaced layout for the boundary.',
      ),
    gridSpacingKm: z
      .number()
      .min(0.05)
      .max(20)
      .optional()
      .describe('Sample grid spacing in km. Smaller = more accurate, slower. Default chosen from boundary area.'),
    weights: weightsSchema.optional(),
  })
  .strict();

export const assessSitePolygonTool: ToolDefinition<typeof inputSchema> = {
  name: 'assess_site_polygon',
  description:
    'Run a full polygon (parcel-level) site assessment for a closed boundary. The engine generates a sample ' +
    'grid inside the polygon, fetches OSM constraint data once for the bounding box, runs `analyseSite` on each ' +
    'sample point in batches, applies exclusion zones (residential buffers, protected areas, water, etc.), and ' +
    'aggregates a viable-area score plus best- and worst-point references. ' +
    'Use when the user has an actual land parcel (not a single point) and wants to know how much of it is ' +
    'usable, where the best turbine positions are, and what constraints are present. ' +
    'Inputs: `polygon` is an ordered array of `{lat, lng}` vertices, minimum 3; `name` labels the boundary; ' +
    '`hubHeightM` defaults to 80; `turbineId` (from `list_turbines`) optionally adds AEP and a layout estimate; ' +
    '`gridSpacingKm` overrides the auto-chosen sample spacing; `weights` is an optional partial weighting. ' +
    'Output: a `SiteAssessment` with sample points, aggregated score, full constraint report, optional energy ' +
    'yield, and metadata. Latency: 30s-3min depending on polygon size and grid spacing.',
  inputSchema,
  handler: async (input) => {
    const polygon: LatLng[] = input.polygon.map((p) => ({ lat: p.lat, lng: p.lng }));
    const boundary = createBoundary(polygon, input.name);

    const turbine = input.turbineId ? getTurbineById(input.turbineId) : undefined;
    if (input.turbineId && !turbine) {
      return toolError('TURBINE_NOT_FOUND', `No turbine with id "${input.turbineId}" in the built-in library.`);
    }

    const result = await assessSite(boundary, {
      ...(input.hubHeightM !== undefined ? { hubHeightM: input.hubHeightM } : {}),
      ...(input.gridSpacingKm !== undefined ? { gridSpacingKm: input.gridSpacingKm } : {}),
      ...(input.weights ? { weights: input.weights } : {}),
      ...(turbine ? { turbineModel: turbine } : {}),
    });
    if (!result.ok) {
      return toolError(result.error.code, result.error.message, result.error.cause);
    }
    return toolSuccess(result.value);
  },
};
