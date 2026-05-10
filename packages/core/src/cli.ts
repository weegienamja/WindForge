import { analyseSite } from './scoring/engine.js';
import { isValidCoordinate } from './utils/geo.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: npx tsx packages/core/src/cli.ts <latitude> <longitude> [--hub-height <m>]');
    console.log('Example: npx tsx packages/core/src/cli.ts 55.86 -4.25 --hub-height 100');
    process.exit(1);
  }

  const lat = Number.parseFloat(args[0]!);
  const lng = Number.parseFloat(args[1]!);

  const hubIdx = args.indexOf('--hub-height');
  const hubArg = hubIdx !== -1 ? args[hubIdx + 1] : undefined;
  const hubHeightM = hubArg ? Number.parseFloat(hubArg) : undefined;

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    console.error('Error: Latitude and longitude must be valid numbers.');
    process.exit(1);
  }

  const coordinate = { lat, lng };

  if (!isValidCoordinate(coordinate)) {
    console.error('Error: Coordinate out of range (lat: -90 to 90, lng: -180 to 180).');
    process.exit(1);
  }

  console.log(`\nWind Site Intelligence`);
  console.log(`Analysing site at ${lat}, ${lng}...\n`);

  const result = await analyseSite({ coordinate, hubHeightM });

  if (!result.ok) {
    console.error(`Analysis failed: ${result.error.message}`);
    process.exit(1);
  }

  const analysis = result.value;

  console.log(`Composite Score: ${analysis.compositeScore}/100\n`);

  console.log('Factor Breakdown:');
  console.log('-'.repeat(80));

  for (const factor of analysis.factors) {
    const bar = '█'.repeat(Math.round(factor.score / 5)) + '░'.repeat(20 - Math.round(factor.score / 5));
    const name = factor.factor
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (s) => s.toUpperCase())
      .trim();
    console.log(`  ${name.padEnd(25)} ${bar} ${String(factor.score).padStart(3)}/100 (weight: ${(factor.weight * 100).toFixed(0)}%)`);
    console.log(`  ${''.padEnd(25)} ${factor.detail}`);
    console.log(`  ${''.padEnd(25)} Confidence: ${factor.confidence} | Source: ${factor.dataSource}`);
    console.log('');
  }

  if (analysis.hardConstraints.length > 0) {
    console.log('\x1b[31m⚠ HARD CONSTRAINTS DETECTED:\x1b[0m');
    for (const constraint of analysis.hardConstraints) {
      console.log(`  [${constraint.severity.toUpperCase()}] ${constraint.description}`);
    }
    console.log('');
  }

  if (analysis.warnings.length > 0) {
    console.log('Warnings:');
    for (const warning of analysis.warnings) {
      console.log(`  - ${warning.description}`);
    }
    console.log('');
  }

  const totalSources = analysis.metadata.sourcesUsed.length + analysis.metadata.sourcesFailed.length;
  const succeeded = analysis.metadata.sourcesUsed.length;
  console.log(`Hub Height: ${analysis.metadata.hubHeightM}m | Wind Shear Alpha: ${analysis.metadata.windShearAlpha.toFixed(2)}`);
  console.log(`Analysis completed in ${analysis.metadata.durationMs}ms`);
  console.log(`Data sources: ${succeeded}/${totalSources} succeeded${analysis.metadata.sourcesFailed.length > 0 ? `, failed: ${analysis.metadata.sourcesFailed.join(', ')}` : ''}`);
  console.log(`Sources: ${analysis.metadata.sourcesUsed.join(', ') || 'N/A'}`);
}

main().catch((error: unknown) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
