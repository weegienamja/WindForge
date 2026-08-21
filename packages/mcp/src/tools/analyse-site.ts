import { z } from 'zod';
import { analyseSite } from '@jamieblair/windforge-core';
import { latLngSchema, hubHeightSchema, weightsSchema } from './shared.js';
import { toolError, toolSuccess, type ToolDefinition } from './types.js';

const inputSchema = z
  .object({
    lat: latLngSchema.shape.lat,
    lng: latLngSchema.shape.lng,
    hubHeightM: hubHeightSchema.optional(),
    weights: weightsSchema.optional(),
  })
  .strict();

export const analyseSiteTool: ToolDefinition<typeof inputSchema> = {
  name: 'analyse_site',
  description:
    'Run a screening-level WindForge point analysis at a single coordinate, returning a composite suitability score when required evidence is available, ' +
    'six weighted factor scores (wind resource, terrain, grid proximity, land use, planning, access), any hard ' +
    'constraints flagged, warnings, completeness, and evidence provenance. ' +
    'Use when the user asks "is this location good for a wind turbine?", wants a quick score, or needs the ' +
    'breakdown across factors. ' +
    'Inputs: `lat` and `lng` are decimal degrees (WGS84); `hubHeightM` defaults to 80; `weights` is an optional ' +
    'partial weighting that the engine renormalises. ' +
    'Output: a `SiteAnalysis` JSON object. ' +
    'Latency: typically 5-30s, depending on public providers. ' +
    'Data sources: NASA POWER, Open-Elevation, OpenStreetMap (Overpass), and Nominatim. ' +
    'This is not a substitute for a formal site assessment with on-site measurements.',
  inputSchema,
  handler: async (input) => {
    const result = await analyseSite({
      coordinate: { lat: input.lat, lng: input.lng },
      ...(input.hubHeightM !== undefined ? { hubHeightM: input.hubHeightM } : {}),
      ...(input.weights ? { weights: input.weights } : {}),
    });
    if (!result.ok) {
      return toolError(result.error.code, result.error.message, result.error.cause);
    }
    return toolSuccess(result.value);
  },
};
