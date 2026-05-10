import { pingTool } from './ping.js';
import { analyseSiteTool } from './analyse-site.js';
import { assessSitePolygonTool } from './assess-site-polygon.js';
import { calculateAepTool } from './calculate-aep.js';
import { listTurbinesTool } from './list-turbines.js';
import { fetchWindHistoryTool } from './fetch-wind-history.js';
import { detectConstraintsTool } from './detect-constraints.js';
import { registerTool, type RegisteredTool } from './types.js';

export const tools: readonly RegisteredTool[] = [
  registerTool(pingTool),
  registerTool(analyseSiteTool),
  registerTool(assessSitePolygonTool),
  registerTool(calculateAepTool),
  registerTool(listTurbinesTool),
  registerTool(fetchWindHistoryTool),
  registerTool(detectConstraintsTool),
];

export {
  pingTool,
  analyseSiteTool,
  assessSitePolygonTool,
  calculateAepTool,
  listTurbinesTool,
  fetchWindHistoryTool,
  detectConstraintsTool,
};
export type {
  ToolDefinition,
  ToolPayload,
  ToolSuccessPayload,
  ToolErrorPayload,
  RegisteredTool,
} from './types.js';
export { toolSuccess, toolError, registerTool } from './types.js';
