#!/usr/bin/env node
/**
 * Pre-publish validator for @jamieblair/windforge-mcp.
 *
 * Asserts the about-to-ship tarball is the exact set of files we want, the
 * package.json carries the metadata an npm consumer expects, and the README
 * still contains the install command, the Claude Desktop config block, and
 * the tool reference table. Any failure here is a real publish blocker.
 */
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const PACKAGE_DIR = join(SCRIPT_DIR, '..');

const MAX_TARBALL_BYTES = 50 * 1024;
const REQUIRED_PKG_FIELDS = [
  'name',
  'version',
  'description',
  'main',
  'bin',
  'files',
  'keywords',
  'repository',
  'homepage',
  'bugs',
  'license',
  'author',
] as const;
const ALLOWED_FILE_PATTERNS: RegExp[] = [
  /^dist\//,
  /^README\.md$/,
  /^package\.json$/,
  /^LICENSE$/,
];
const FORBIDDEN_FILE_PATTERNS: RegExp[] = [
  /^src\//,
  /^tests\//,
  /^tsconfig.*\.json$/,
  /^vitest.*\.config\.[cm]?ts$/,
  /^\.env/,
  /\.test\.[cm]?ts$/,
];

const REQUIRED_README_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'install command', pattern: /npx\s+-y\s+@jamieblair\/windforge-mcp/i },
  { name: 'claude_desktop_config block', pattern: /claude_desktop_config/i },
  { name: 'tool reference table (analyse_site)', pattern: /\|\s*`analyse_site`\s*\|/ },
];

interface PackTarballEntry {
  path: string;
  size: number;
}

interface PackResult {
  files: PackTarballEntry[];
  totalBytes: number;
}

function fail(message: string): never {
  console.error(`validate-publish: FAIL: ${message}`);
  process.exit(1);
}

function runBuild(): void {
  console.log('validate-publish: running pnpm build...');
  const result = spawnSync('pnpm', ['build'], {
    cwd: PACKAGE_DIR,
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) fail('pnpm build exited non-zero');
}

function runPackDryRun(): PackResult {
  console.log('validate-publish: running npm pack --dry-run...');
  const raw = execSync('npm pack --dry-run --json', {
    cwd: PACKAGE_DIR,
    encoding: 'utf8',
  });
  const parsed: Array<{ files: PackTarballEntry[]; size: number; unpackedSize: number }> = JSON.parse(raw);
  const entry = parsed[0];
  if (!entry) fail('npm pack returned no entries');
  return { files: entry.files, totalBytes: entry.size };
}

function assertTarballSize(bytes: number): void {
  if (bytes > MAX_TARBALL_BYTES) {
    fail(`tarball is ${bytes} bytes, exceeds ${MAX_TARBALL_BYTES}-byte ceiling`);
  }
  console.log(`validate-publish: tarball size ${bytes} bytes (ceiling ${MAX_TARBALL_BYTES})`);
}

function assertTarballContents(files: PackTarballEntry[]): void {
  for (const file of files) {
    const path = file.path;
    if (FORBIDDEN_FILE_PATTERNS.some((p) => p.test(path))) {
      fail(`forbidden file in tarball: ${path}`);
    }
    if (!ALLOWED_FILE_PATTERNS.some((p) => p.test(path))) {
      fail(`unexpected file in tarball: ${path}`);
    }
  }
  const requiredTopLevel = ['README.md', 'package.json', 'LICENSE'];
  for (const required of requiredTopLevel) {
    if (!files.some((f) => f.path === required)) {
      fail(`missing required file in tarball: ${required}`);
    }
  }
  if (!files.some((f) => f.path.startsWith('dist/'))) {
    fail('tarball contains no dist/ entries; build did not run');
  }
}

function assertPackageFields(): void {
  const pkg = JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf8')) as Record<string, unknown>;
  for (const field of REQUIRED_PKG_FIELDS) {
    if (pkg[field] === undefined || pkg[field] === null || pkg[field] === '') {
      fail(`package.json missing required field: ${field}`);
    }
  }
  const keywords = pkg.keywords;
  if (!Array.isArray(keywords) || keywords.length < 3) {
    fail('package.json keywords must be an array of at least 3 entries');
  }
  console.log('validate-publish: package.json fields OK');
}

function assertReadmeShape(): void {
  const readme = readFileSync(join(PACKAGE_DIR, 'README.md'), 'utf8');
  for (const { name, pattern } of REQUIRED_README_PATTERNS) {
    if (!pattern.test(readme)) {
      fail(`README missing ${name} (pattern ${pattern.source})`);
    }
  }
  console.log('validate-publish: README shape OK');
}

function main(): void {
  runBuild();
  const { files, totalBytes } = runPackDryRun();
  assertTarballSize(totalBytes);
  assertTarballContents(files);
  assertPackageFields();
  assertReadmeShape();
  console.log('validate-publish: OK. Package is ready to publish.');
}

main();
