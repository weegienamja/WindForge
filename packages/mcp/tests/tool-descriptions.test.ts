import { describe, it, expect } from 'vitest';
import { tools } from '../src/tools/index.js';

describe('tool description quality', () => {
  for (const tool of tools) {
    if (tool.name === 'ping') continue; // ping is a heartbeat, not a domain tool

    describe(tool.name, () => {
      it('has a description of at least 200 characters', () => {
        expect(tool.description.length).toBeGreaterThanOrEqual(200);
      });

      it('mentions when to use it', () => {
        expect(tool.description.toLowerCase()).toMatch(/use when|use this/);
      });

      it('mentions both inputs and outputs', () => {
        expect(tool.description.toLowerCase()).toContain('input');
        expect(tool.description.toLowerCase()).toMatch(/output|returns|return/);
      });
    });
  }

  it('has unique tool names', () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('uses the canonical naming pattern', () => {
    for (const tool of tools) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});
