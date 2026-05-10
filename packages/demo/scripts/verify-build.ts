#!/usr/bin/env node
/**
 * Production build verifier. Runs `next build` and fails if the output
 * contains anything that should block a launch: type errors, module-not
 * -found errors, deprecation warnings, invalid metadata warnings, or
 * generic `Error:` / `Warning:` lines outside the allowlist.
 *
 * Run with: pnpm verify-build (from packages/demo).
 */
import { spawn } from 'node:child_process';

/**
 * Allowlist of warning substrings that we accept as known-noisy and
 * non-blocking. Each entry has a comment explaining why it is allowed.
 */
const ALLOWED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // Next.js prints "Compiled with warnings" as a literal banner only when
  // there are real warnings; the per-warning lines below it are what we
  // actually check, so the banner itself is not a useful signal.
  { pattern: /Compiled with warnings/i, reason: 'banner only, real warnings checked individually' },
  // Next.js sometimes prints a generic "warning" line under the route table
  // that is informational, e.g. "Configured `transpilePackages` may slow
  // builds." This is deliberate config and not actionable.
  { pattern: /transpilePackages.*may slow/i, reason: 'deliberate transpile config for our workspace packages' },
  // npm/pnpm peer warnings get echoed during install steps that some
  // CI hosts run before build; they belong to install, not build.
  { pattern: /peer dep/i, reason: 'install-time peer warnings, not a build issue' },
  // Edge-runtime printout from next/og; informational only.
  { pattern: /A Node\.js API is used.*ImageResponse/i, reason: 'OG route is nodejs runtime by design' },
];

const BLOCKING_PATTERNS: RegExp[] = [
  /^Error:/m,
  /Type error:/i,
  /Cannot find module/i,
  /Module not found/i,
  /Failed to compile/i,
  /Build error occurred/i,
  /UnhandledPromiseRejection/i,
];

const WARNING_PATTERNS: RegExp[] = [
  /^Warning:/m,
  /deprecat/i,
  /invalid (metadata|configuration)/i,
];

interface BuildResult {
  exitCode: number;
  output: string;
}

function runBuild(): Promise<BuildResult> {
  return new Promise((resolve) => {
    const child = spawn('pnpm', ['exec', 'next', 'build'], {
      shell: true,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      const str = String(chunk);
      output += str;
      process.stdout.write(str);
    });
    child.stderr.on('data', (chunk) => {
      const str = String(chunk);
      output += str;
      process.stderr.write(str);
    });
    child.on('close', (code) => {
      resolve({ exitCode: code ?? 1, output });
    });
  });
}

function isAllowed(line: string): boolean {
  return ALLOWED_PATTERNS.some(({ pattern }) => pattern.test(line));
}

async function main(): Promise<void> {
  console.log('verify-build: starting Next.js production build...');
  const { exitCode, output } = await runBuild();

  if (exitCode !== 0) {
    console.error(`\nverify-build: next build exited with code ${exitCode}.`);
    process.exit(exitCode);
  }

  const lines = output.split(/\r?\n/);
  const blocking: string[] = [];
  const warnings: string[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    if (isAllowed(line)) continue;

    if (BLOCKING_PATTERNS.some((p) => p.test(line))) {
      blocking.push(line);
      continue;
    }
    if (WARNING_PATTERNS.some((p) => p.test(line))) {
      warnings.push(line);
    }
  }

  if (blocking.length > 0) {
    console.error('\nverify-build: BLOCKING issues detected:');
    for (const line of blocking) console.error(`  ${line.trim()}`);
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.error('\nverify-build: unallowlisted warnings detected:');
    for (const line of warnings) console.error(`  ${line.trim()}`);
    process.exit(1);
  }

  console.log('\nverify-build: OK. Production build clean.');
}

void main();
