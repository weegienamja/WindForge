import { z } from 'zod';
import { fetchMonthlyWindHistory } from '@jamieblair/windforge-core';
import { latLngSchema } from './shared.js';
import { toolError, toolSuccess, type ToolDefinition } from './types.js';

const inputSchema = z
  .object({
    lat: latLngSchema.shape.lat,
    lng: latLngSchema.shape.lng,
    years: z
      .number()
      .int()
      .min(1)
      .max(40)
      .optional()
      .describe('Number of years of monthly history to fetch, ending at the previous calendar year. Default 10.'),
  })
  .strict();

export const fetchWindHistoryTool: ToolDefinition<typeof inputSchema> = {
  name: 'fetch_wind_history',
  description:
    'Fetch the NASA POWER monthly wind history for a coordinate, returning per-year-per-month wind speeds at ' +
    '2m, 10m, and 50m plus directions at 10m and 50m. Use this when the user wants the raw historical record ' +
    'rather than a single composite score. Useful for trend analysis, seasonality charts, year-over-year ' +
    'comparison, or feeding the engine\'s own bias-correction pipeline. ' +
    'Inputs: `lat` and `lng` (decimal degrees, WGS84); `years` is the number of years to look back (1-40, default 10). ' +
    'Output: a `MonthlyWindHistory` object with an array of monthly records, the start and end years, and the ' +
    'reference height. Results are cached aggressively (NASA POWER monthly data is static except for the most ' +
    'recent month). Latency: 1-3s on cold cache, instant warm.',
  inputSchema,
  handler: async (input) => {
    const result = await fetchMonthlyWindHistory(
      { lat: input.lat, lng: input.lng },
      input.years,
    );
    if (!result.ok) {
      return toolError(result.error.code, result.error.message, result.error.cause);
    }
    return toolSuccess(result.value);
  },
};
