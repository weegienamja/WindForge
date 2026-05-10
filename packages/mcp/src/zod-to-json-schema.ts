/**
 * Minimal Zod -> JSON Schema converter sufficient for WindForge MCP tool
 * input schemas. Supports: ZodObject, ZodString, ZodNumber, ZodBoolean,
 * ZodArray, ZodOptional, ZodDefault, ZodEnum, ZodLiteral, ZodNullable,
 * ZodUnion (homogeneous primitives), and `.describe()` annotations.
 *
 * We intentionally avoid pulling in `zod-to-json-schema` to keep the
 * dependency surface small. Tools should keep their input schemas
 * narrow; if you need a feature not handled here, extend this file.
 */

import { ZodTypeAny } from 'zod';

interface JsonSchema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  additionalProperties?: boolean | JsonSchema;
  enum?: readonly (string | number | boolean)[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  anyOf?: JsonSchema[];
  const?: unknown;
  [key: string]: unknown;
}

function readDescription(schema: ZodTypeAny): string | undefined {
  // ZodType's `_def` holds an optional `description`.
  const def = schema._def as { description?: unknown };
  return typeof def.description === 'string' ? def.description : undefined;
}

export function zodToJsonSchema(schema: ZodTypeAny): JsonSchema {
  const def = schema._def as { typeName?: string };
  const typeName = def.typeName;

  switch (typeName) {
    case 'ZodObject': {
      const shape = (schema as unknown as { shape: Record<string, ZodTypeAny> }).shape;
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(value);
        const inner = unwrap(value);
        const isOptional = inner.optional || inner.hasDefault;
        if (!isOptional) required.push(key);
      }
      const result: JsonSchema = {
        type: 'object',
        properties,
        additionalProperties: false,
      };
      if (required.length > 0) result.required = required;
      const description = readDescription(schema);
      if (description) result.description = description;
      return result;
    }
    case 'ZodString': {
      const result: JsonSchema = { type: 'string' };
      const description = readDescription(schema);
      if (description) result.description = description;
      return result;
    }
    case 'ZodNumber': {
      const result: JsonSchema = { type: 'number' };
      const description = readDescription(schema);
      if (description) result.description = description;
      const checks = (schema._def as { checks?: Array<{ kind: string; value?: number }> }).checks ?? [];
      for (const check of checks) {
        if (check.kind === 'min' && typeof check.value === 'number') result.minimum = check.value;
        if (check.kind === 'max' && typeof check.value === 'number') result.maximum = check.value;
      }
      return result;
    }
    case 'ZodBoolean': {
      const result: JsonSchema = { type: 'boolean' };
      const description = readDescription(schema);
      if (description) result.description = description;
      return result;
    }
    case 'ZodArray': {
      const inner = (schema._def as { type: ZodTypeAny }).type;
      const result: JsonSchema = { type: 'array', items: zodToJsonSchema(inner) };
      const description = readDescription(schema);
      if (description) result.description = description;
      return result;
    }
    case 'ZodOptional': {
      const inner = (schema._def as { innerType: ZodTypeAny }).innerType;
      return zodToJsonSchema(inner);
    }
    case 'ZodDefault': {
      const inner = (schema._def as { innerType: ZodTypeAny; defaultValue: () => unknown }).innerType;
      const result = zodToJsonSchema(inner);
      try {
        result.default = (schema._def as { defaultValue: () => unknown }).defaultValue();
      } catch {
        // ignore default extraction failures
      }
      return result;
    }
    case 'ZodEnum': {
      const values = (schema._def as { values: readonly string[] }).values;
      return { type: 'string', enum: values };
    }
    case 'ZodLiteral': {
      const value = (schema._def as { value: unknown }).value;
      const t = typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string';
      return { type: t, const: value };
    }
    case 'ZodNullable': {
      const inner = (schema._def as { innerType: ZodTypeAny }).innerType;
      const base = zodToJsonSchema(inner);
      const types = Array.isArray(base.type) ? base.type : base.type ? [base.type] : [];
      return { ...base, type: [...types, 'null'] };
    }
    case 'ZodUnion': {
      const options = (schema._def as { options: ZodTypeAny[] }).options;
      return { anyOf: options.map((opt) => zodToJsonSchema(opt)) };
    }
    case 'ZodEffects': {
      // `.refine` / `.transform` / `.preprocess` wrap their inner schema in
      // ZodEffects. JSON Schema can't represent the runtime effect, but the
      // shape is the underlying schema's shape.
      const inner = (schema._def as { schema: ZodTypeAny }).schema;
      const result = zodToJsonSchema(inner);
      const description = readDescription(schema);
      if (description && !result.description) result.description = description;
      return result;
    }
    case 'ZodCatch':
    case 'ZodReadonly':
    case 'ZodBranded': {
      const inner = (schema._def as { innerType?: ZodTypeAny; type?: ZodTypeAny }).innerType
        ?? (schema._def as { type?: ZodTypeAny }).type;
      if (!inner) return {};
      return zodToJsonSchema(inner);
    }
    case 'ZodRecord': {
      const valueType = (schema._def as { valueType: ZodTypeAny }).valueType;
      return {
        type: 'object',
        additionalProperties: zodToJsonSchema(valueType),
      };
    }
    case 'ZodTuple': {
      const items = (schema._def as { items: ZodTypeAny[] }).items;
      return {
        type: 'array',
        items: items.map((it) => zodToJsonSchema(it)) as unknown as JsonSchema,
      };
    }
    case 'ZodAny':
    case 'ZodUnknown':
      return {};
    default:
      return {};
  }
}

function unwrap(schema: ZodTypeAny): { optional: boolean; hasDefault: boolean } {
  const def = schema._def as { typeName?: string; innerType?: ZodTypeAny; schema?: ZodTypeAny };
  if (def.typeName === 'ZodOptional') return { optional: true, hasDefault: false };
  if (def.typeName === 'ZodDefault') return { optional: false, hasDefault: true };
  // Unwrap effects/branded/readonly to peek at the underlying optional/default.
  if (def.typeName === 'ZodEffects' && def.schema) return unwrap(def.schema);
  if ((def.typeName === 'ZodBranded' || def.typeName === 'ZodReadonly' || def.typeName === 'ZodCatch') && def.innerType) {
    return unwrap(def.innerType);
  }
  return { optional: false, hasDefault: false };
}
