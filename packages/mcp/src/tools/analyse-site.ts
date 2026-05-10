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
    cdsApiKey: z
      .string()
      .min(1)
      .optional()
      .describe('Optional Copernicus CDS API key. If omitted, the CDS_API_KEY environment variable is used (when set).'),
  })
  .strict();

export const analyseSiteTool: ToolDefinition<typeof inputSchema> = {
  name: 'analyse_site',
  description:
    'Run a full WindForge point analysis at a single coordinate, returning a 0-100 composite suitability score, ' +
    'six weighted factor scores (wind resource, terrain, grid proximity, land use, planning, access), any hard ' +
    'constraints flagged, warnings, and a metadata block including bias-correction diagnostics when ERA5 / CERRA ' +
    'reanalysis is available. ' +
    'Use when the user asks "is this location good for a wind turbine?", wants a quick score, or needs the ' +
    'breakdown across factors. ' +
    'Inputs: `lat` and `lng` are decimal degrees (WGS84); `hubHeightM` defaults to 80; `weights` is an optional ' +
    'partial weighting that the engine renormalises; `cdsApiKey` overrides the environment variable. ' +
    'Output: a `SiteAnalysis` JSON object. ' +
    'Latency: 5-15s without reanalysis; 30-90s on a cold ERA5 / CERRA fetch (results are then cached for 7 days). ' +
    'Data sources: NASA POWER, Open-Elevation, OpenStreetMap (Overpass), Nominatim, optionally ERA5 and CERRA. ' +
    'This is not a substitute for a formal site assessment with on-site measurements.',
  inputSchema,
  handler: async (input) => {
    const result = await analyseSite({
      coordinate: { lat: input.lat, lng: input.lng },
      ...(input.hubHeightM !== undefined ? { hubHeightM: input.hubHeightM } : {}),
      ...(input.weights ? { weights: input.weights } : {}),
      ...(input.cdsApiKey ? { cdsApiKey: input.cdsApiKey } : {}),
    });
    if (!result.ok) {
      return toolError(result.error.code, result.error.message, result.error.cause);
    }
    return toolSuccess(result.value);
  },
};
