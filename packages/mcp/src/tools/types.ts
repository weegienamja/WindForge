/**
 * Tool definition shape used across the WindForge MCP server.
 *
 * Each tool has:
 *  - a stable name (snake_case)
 *  - a Zod input schema (also rendered as JSON schema for the MCP client)
 *  - a long-form description that an LLM can read in isolation and know
 *    what the tool is for, when to use it, and what comes back
 *  - a handler that returns either a JSON-serialisable success payload
 *    or a structured error object
 */

import type { z, ZodTypeAny } from 'zod';

export interface ToolErrorPayload {
  error: {
    code: string;
    message: string;
    cause?: unknown;
  };
}

export interface ToolSuccessPayload<T = unknown> {
  ok: true;
  data: T;
}

export type ToolPayload<T = unknown> = ToolSuccessPayload<T> | ToolErrorPayload;

export interface ToolDefinition<Schema extends ZodTypeAny = ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: Schema;
  handler: (input: z.infer<Schema>) => Promise<ToolPayload>;
}

/**
 * Storage type for the tool registry. Drops the generic so a heterogeneous
 * collection of tools can sit in a single `readonly` array without
 * variance pain. Handlers accept `unknown` here; the actual Zod schema
 * is run before the handler is invoked, narrowing the input safely.
 */
export interface RegisteredTool {
  name: string;
  description: string;
  inputSchema: ZodTypeAny;
  handler: (input: unknown) => Promise<ToolPayload>;
}

export function registerTool<Schema extends ZodTypeAny>(tool: ToolDefinition<Schema>): RegisteredTool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    handler: (input: unknown) => tool.handler(input as z.infer<Schema>),
  };
}

export function toolSuccess<T>(data: T): ToolSuccessPayload<T> {
  return { ok: true, data };
}

export function toolError(code: string, message: string, cause?: unknown): ToolErrorPayload {
  return cause === undefined
    ? { error: { code, message } }
    : { error: { code, message, cause } };
}
