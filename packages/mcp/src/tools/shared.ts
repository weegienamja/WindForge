/**
 * Shared Zod fragments reused across WindForge MCP tool input schemas.
 *
 * Centralising these keeps validation messages consistent and makes it
 * obvious which inputs are coordinates vs polygons vs scoring weights.
 */

import { z } from 'zod';

export const latitudeSchema = z
  .number()
  .min(-90)
  .max(90)
  .describe('Latitude in decimal degrees, WGS84.');

export const longitudeSchema = z
  .number()
  .min(-180)
  .max(180)
  .describe('Longitude in decimal degrees, WGS84.');

export const latLngSchema = z
  .object({
    lat: latitudeSchema,
    lng: longitudeSchema,
  })
  .strict();

export const polygonSchema = z
  .array(latLngSchema)
  .min(3)
  .describe(
    'Closed polygon as an ordered array of {lat, lng} vertices. Minimum 3 vertices. ' +
      'The polygon does not need to repeat the first point at the end; the engine will close it.',
  );

export const hubHeightSchema = z
  .number()
  .min(10)
  .max(300)
  .describe('Hub height in metres above ground. Typical onshore range: 80-150m.');

export const weightsSchema = z
  .object({
    windResource: z.number().min(0).max(1).optional(),
    terrainSuitability: z.number().min(0).max(1).optional(),
    gridProximity: z.number().min(0).max(1).optional(),
    landUseCompatibility: z.number().min(0).max(1).optional(),
    planningFeasibility: z.number().min(0).max(1).optional(),
    accessLogistics: z.number().min(0).max(1).optional(),
  })
  .strict()
  .describe(
    'Optional partial scoring weights. Any subset is allowed; missing factors keep their default. ' +
      'Engine renormalises to sum to 1.0 across the six factors.',
  );
