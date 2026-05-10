import { defineConfig } from 'vitest/config';

/**
 * Integration test config. Runs the MCP tools against the REAL core engine
 * and live external APIs (NASA POWER, OpenStreetMap Overpass, Open-Elevation,
 * optionally ERA5 / CERRA when CDS_API_KEY is set).
 *
 * These are slow (seconds to minutes per test) and consume real API quota.
 * They are NOT run by `pnpm test`. Use `pnpm test:integration`.
 */
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 30_000,
    // Run sequentially so we don't hammer the same upstream API in parallel.
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
