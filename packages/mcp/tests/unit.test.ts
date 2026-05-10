import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { tools } from '../src/tools/index.js';
import { pingTool } from '../src/tools/ping.js';
import { zodToJsonSchema } from '../src/zod-to-json-schema.js';

describe('mcp tool registry', () => {
  it('registers the ping tool', () => {
    const names = tools.map((t) => t.name);
    expect(names).toContain('ping');
  });

  it('every registered tool has a usable description and Zod schema', () => {
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(40);
      expect(tool.inputSchema).toBeDefined();
      // Convert without throwing.
      expect(() => zodToJsonSchema(tool.inputSchema)).not.toThrow();
    }
  });

  it('tool names are unique snake_case', () => {
    const seen = new Set<string>();
    for (const tool of tools) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(seen.has(tool.name)).toBe(false);
      seen.add(tool.name);
    }
  });
});

describe('ping tool', () => {
  it('returns a structured success payload with timestamp', async () => {
    const result = await pingTool.handler({});
    expect('ok' in result && result.ok).toBe(true);
    if (!('ok' in result) || !result.ok) return;
    expect(result.data).toMatchObject({ pong: true });
    const ts = (result.data as { timestamp: string }).timestamp;
    expect(typeof ts).toBe('string');
    expect(() => new Date(ts).toISOString()).not.toThrow();
  });

  it('rejects unknown input fields via strict schema', () => {
    const parsed = pingTool.inputSchema.safeParse({ unexpected: 1 });
    expect(parsed.success).toBe(false);
  });
});

describe('zodToJsonSchema', () => {
  it('converts a basic object schema', () => {
    const schema = z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number(),
      name: z.string().optional(),
      hubHeightM: z.number().default(80),
    });
    const json = zodToJsonSchema(schema);
    expect(json.type).toBe('object');
    expect(json.required?.sort()).toEqual(['lat', 'lng']);
    expect(json.properties?.lat?.minimum).toBe(-90);
    expect(json.properties?.lat?.maximum).toBe(90);
    expect(json.properties?.hubHeightM?.default).toBe(80);
  });

  it('handles enums and arrays', () => {
    const schema = z.object({
      mode: z.enum(['fast', 'full']),
      points: z.array(z.number()),
    });
    const json = zodToJsonSchema(schema);
    expect(json.properties?.mode?.enum).toEqual(['fast', 'full']);
    expect(json.properties?.points?.type).toBe('array');
    expect(json.properties?.points?.items?.type).toBe('number');
  });

  it('handles arrays of nested objects (polygon shape)', () => {
    const polygon = z.array(z.object({ lat: z.number(), lng: z.number() })).min(3);
    const schema = z.object({ polygon });
    const json = zodToJsonSchema(schema);
    expect(json.properties?.polygon?.type).toBe('array');
    expect(json.properties?.polygon?.items?.type).toBe('object');
    const itemProps = json.properties?.polygon?.items?.properties;
    expect(itemProps?.lat?.type).toBe('number');
    expect(itemProps?.lng?.type).toBe('number');
  });

  it('treats ZodEffects (refine/transform) as its inner shape', () => {
    const schema = z
      .object({ lat: z.number(), lng: z.number() })
      .refine((v) => v.lat !== 0, { message: 'no zero lat' });
    const json = zodToJsonSchema(schema);
    expect(json.type).toBe('object');
    expect(json.required?.sort()).toEqual(['lat', 'lng']);
  });

  it('handles ZodRecord by emitting additionalProperties', () => {
    const schema = z.object({ weights: z.record(z.number()) });
    const json = zodToJsonSchema(schema);
    expect(json.properties?.weights?.type).toBe('object');
    const ap = json.properties?.weights?.additionalProperties as { type?: string } | undefined;
    expect(ap?.type).toBe('number');
  });

  it('honours .describe() on fields', () => {
    const schema = z.object({
      lat: z.number().describe('Latitude in degrees'),
    });
    const json = zodToJsonSchema(schema);
    expect(json.properties?.lat?.description).toBe('Latitude in degrees');
  });
});
