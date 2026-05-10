#!/usr/bin/env node
/**
 * Em-dash audit. WindForge has a hard rule against U+2014 in source, copy,
 * docs, and comments. This script greps every tracked text file under the
 * repo root and exits non-zero if it finds any. Generated lockfiles and
 * build artefacts are excluded.
 *
 * Run with: pnpm audit:em-dashes
 */
import { readFileSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const EM_DASH = '\u2014';
const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, '..');

const INCLUDE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.md', '.mdx', '.json', '.yml', '.yaml']);

const EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  '.next',
  '.turbo',
  'coverage',
  '.git',
  '.vercel',
  'build',
  'out',
]);

const EXCLUDED_FILES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
]);

interface Hit {
  file: string;
  line: number;
  column: number;
  excerpt: string;
}

async function walk(dir: string, hits: Hit[]): Promise<void> {
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      // Skip hidden tooling directories (.codex, .vercel, .turbo, etc.)
      // except for .github which carries our PR/issue templates.
      if (entry.name.startsWith('.') && entry.name !== '.github') continue;
      await walk(full, hits);
      continue;
    }
    if (!entry.isFile()) continue;
    if (EXCLUDED_FILES.has(entry.name)) continue;
    if (!INCLUDE_EXT.has(extname(entry.name))) continue;

    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    // Skip anything > 2MB defensively.
    if (stat.size > 2 * 1024 * 1024) continue;

    let content: string;
    try {
      content = readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    if (!content.includes(EM_DASH)) continue;

    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const idx = lines[i].indexOf(EM_DASH);
      if (idx === -1) continue;
      hits.push({
        file: relative(REPO_ROOT, full).split(sep).join('/'),
        line: i + 1,
        column: idx + 1,
        excerpt: lines[i].trim().slice(0, 140),
      });
    }
  }
}

async function main(): Promise<void> {
  const hits: Hit[] = [];
  await walk(REPO_ROOT, hits);

  if (hits.length === 0) {
    console.log('OK: no em dashes (U+2014) found.');
    return;
  }

  console.error(`FAIL: found ${hits.length} em dash occurrence(s).`);
  for (const hit of hits) {
    console.error(`  ${hit.file}:${hit.line}:${hit.column}  ${hit.excerpt}`);
  }
  process.exit(1);
}

void main();
