import { z } from 'zod';
import { toolSuccess, type ToolDefinition } from './types.js';

const inputSchema = z.object({}).strict();

export const pingTool: ToolDefinition<typeof inputSchema> = {
  name: 'ping',
  description:
    'Health check tool. Returns the current server timestamp and a static `pong: true` flag. ' +
    'Use when you want to verify that the WindForge MCP server is reachable and responsive ' +
    'before issuing more expensive analysis calls. Inputs: none. Output: `{ pong: true, timestamp }` ' +
    'where `timestamp` is an ISO 8601 string.',
  inputSchema,
  handler: async () => toolSuccess({ pong: true, timestamp: new Date().toISOString() }),
};
