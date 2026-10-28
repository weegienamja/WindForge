import { z } from 'zod';

/** Describe the accepted input, including optional defaults and all JSON constraints. */
export function zodToJsonSchema(schema: z.ZodType): z.core.JSONSchema.JSONSchema {
  return z.toJSONSchema(schema, { target: 'draft-07', io: 'input' });
}
