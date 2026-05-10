import { z } from 'zod';
import { getAllTurbines } from '@jamieblair/windforge-core';
import { toolSuccess, type ToolDefinition } from './types.js';

const inputSchema = z.object({}).strict();

export const listTurbinesTool: ToolDefinition<typeof inputSchema> = {
  name: 'list_turbines',
  description:
    'List every turbine model in the built-in WindForge library. Each entry includes the stable `id` to pass ' +
    'to other tools, plus manufacturer, model, rated power (kW), rotor diameter (m), and the available hub-height ' +
    'options (m). The full power curve is omitted from this listing to keep the response compact; pass the ' +
    '`id` to `calculate_aep` or `assess_site_polygon` to use it. ' +
    'Use when the user asks "what turbines do you support?", or before calling AEP / polygon-assessment tools so ' +
    'you can pick a model that matches the site (typical onshore: 2.5-4 MW class). ' +
    'Inputs: none. ' +
    'Output: an array of `{ id, manufacturer, model, ratedPowerKw, rotorDiameterM, hubHeightOptionsM }` records.',
  inputSchema,
  handler: async () => {
    const summary = getAllTurbines().map((t) => ({
      id: t.id,
      manufacturer: t.manufacturer,
      model: t.model,
      ratedPowerKw: t.ratedPowerKw,
      rotorDiameterM: t.rotorDiameterM,
      hubHeightOptionsM: t.hubHeightOptionsM,
      cutInSpeedMs: t.cutInSpeedMs,
      ratedSpeedMs: t.ratedSpeedMs,
      cutOutSpeedMs: t.cutOutSpeedMs,
    }));
    return toolSuccess({ turbines: summary, count: summary.length });
  },
};
