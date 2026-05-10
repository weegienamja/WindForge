import { z } from 'zod';
import {
  calculateAep,
  fetchWindData,
  getTurbineById,
} from '@jamieblair/windforge-core';
import { latLngSchema, hubHeightSchema } from './shared.js';
import { toolError, toolSuccess, type ToolDefinition } from './types.js';

const inputSchema = z
  .object({
    lat: latLngSchema.shape.lat,
    lng: latLngSchema.shape.lng,
    turbineId: z
      .string()
      .min(1)
      .describe('Turbine model id from `list_turbines` (e.g. "vestas-v112-3450", "ge-2.5-120").'),
    hubHeightM: hubHeightSchema.optional(),
    turbineCount: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Number of identical turbines on site. AEP scales linearly. Default 1.'),
  })
  .strict();

export const calculateAepTool: ToolDefinition<typeof inputSchema> = {
  name: 'calculate_aep',
  description:
    'Estimate Annual Energy Production for a chosen turbine model at a given coordinate. The engine fetches ' +
    'NASA POWER wind data, extrapolates mean speed to hub height, fits a Weibull distribution from mean and ' +
    'standard deviation, integrates the manufacturer power curve against the Weibull PDF, applies an air-density ' +
    'correction, and runs a loss stack (wake, electrical, availability, environmental) to produce gross and net ' +
    'AEP plus P50 / P75 / P90 scenarios from interannual variability and a monthly production breakdown. ' +
    'Use when the user wants kWh-per-year, a capacity factor, or to compare turbine models at the same site. ' +
    'Inputs: `lat` and `lng` (decimal degrees, WGS84); `turbineId` from `list_turbines`; `hubHeightM` defaults ' +
    'to the turbine\'s first listed hub height; `turbineCount` defaults to 1. ' +
    'Output: `EnergyYieldResult` with grossAepKwh, netAepKwh, capacityFactor, p50/p75/p90 scenarios, monthly ' +
    'breakdown, and a per-component loss stack. Latency: 5-10s.',
  inputSchema,
  handler: async (input) => {
    const turbine = getTurbineById(input.turbineId);
    if (!turbine) {
      return toolError('TURBINE_NOT_FOUND', `No turbine with id "${input.turbineId}" in the built-in library.`);
    }

    const windResult = await fetchWindData({ lat: input.lat, lng: input.lng });
    if (!windResult.ok) {
      return toolError(windResult.error.code, windResult.error.message, windResult.error.cause);
    }

    const aepResult = calculateAep(windResult.value, turbine, {
      ...(input.hubHeightM !== undefined ? { hubHeightM: input.hubHeightM } : {}),
      ...(input.turbineCount !== undefined ? { turbineCount: input.turbineCount } : {}),
    });
    if (!aepResult.ok) {
      return toolError(aepResult.error.code, aepResult.error.message, aepResult.error.cause);
    }
    return toolSuccess(aepResult.value);
  },
};
