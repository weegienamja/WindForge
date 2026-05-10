import axe from 'axe-core';
import { expect } from 'vitest';

/**
 * Run axe-core against a DOM container and assert no violations.
 * Uses axe-core directly. No jest-axe / vitest-axe dependency required.
 *
 * Disables a couple of jsdom-incompatible rules:
 * - color-contrast: jsdom doesn't compute layout/colours, so contrast can't
 *   be measured reliably from tests.
 * - region: tests render bare components, not full landmark structures.
 */
export async function expectNoAxeViolations(container: Element): Promise<void> {
  const results = await axe.run(container, {
    rules: {
      'color-contrast': { enabled: false },
      region: { enabled: false },
    },
  });

  if (results.violations.length > 0) {
    const detail = results.violations
      .map((v) => `[${v.id}] ${v.help} (${v.nodes.length} node(s))`)
      .join('\n');
    expect.fail(`axe-core found ${results.violations.length} accessibility violation(s):\n${detail}`);
  }
}
