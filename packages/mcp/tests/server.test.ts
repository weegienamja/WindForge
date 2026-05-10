import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = dirname(fileURLToPath(import.meta.url));
const serverEntry = resolve(here, '..', 'src', 'server.ts');
const tsxBin = resolve(here, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs');

interface Spawned {
  client: Client;
  close: () => Promise<void>;
}

async function startServer(): Promise<Spawned> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [tsxBin, serverEntry],
    env: { ...process.env, LOG_LEVEL: 'error' },
  });
  const client = new Client({ name: 'windforge-mcp-test', version: '0.0.0' }, { capabilities: {} });
  await client.connect(transport);
  return {
    client,
    close: async () => {
      await client.close().catch(() => undefined);
    },
  };
}

describe('windforge mcp server (stdio e2e)', () => {
  let spawned: Spawned | null = null;

  beforeEach(async () => {
    spawned = await startServer();
  });

  afterEach(async () => {
    if (spawned) await spawned.close();
    spawned = null;
  });

  it('lists the ping tool with a usable schema', async () => {
    if (!spawned) throw new Error('not started');
    const result = await spawned.client.listTools();
    const names = result.tools.map((t) => t.name);
    expect(names).toContain('ping');
    const ping = result.tools.find((t) => t.name === 'ping');
    expect(ping?.description.length ?? 0).toBeGreaterThan(40);
    expect(ping?.inputSchema).toMatchObject({ type: 'object' });
  });

  it('invokes ping and returns a structured payload', async () => {
    if (!spawned) throw new Error('not started');
    const result = await spawned.client.callTool({ name: 'ping', arguments: {} });
    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.type).toBe('text');
    const parsed = JSON.parse(content[0]!.text);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.pong).toBe(true);
    expect(typeof parsed.data.timestamp).toBe('string');
  });

  it('returns a structured error for an unknown tool', async () => {
    if (!spawned) throw new Error('not started');
    const result = await spawned.client.callTool({ name: 'does_not_exist', arguments: {} });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0]!.text);
    expect(parsed.error.code).toBe('UNKNOWN_TOOL');
  });

  it('returns INVALID_INPUT for malformed arguments', async () => {
    if (!spawned) throw new Error('not started');
    const result = await spawned.client.callTool({ name: 'ping', arguments: { rogue: 1 } });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0]!.text);
    expect(parsed.error.code).toBe('INVALID_INPUT');
  });
});

describe('windforge mcp server CLI', () => {
  function spawnCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolveOnce) => {
      const child: ChildProcessWithoutNullStreams = spawn(
        process.execPath,
        [tsxBin, serverEntry, ...args],
        { env: { ...process.env, LOG_LEVEL: 'error' } },
      );
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (b) => {
        stdout += b.toString('utf-8');
      });
      child.stderr.on('data', (b) => {
        stderr += b.toString('utf-8');
      });
      child.on('exit', (code) => resolveOnce({ code: code ?? 0, stdout, stderr }));
    });
  }

  it('--version prints version on stdout and exits 0', async () => {
    const { code, stdout } = await spawnCli(['--version']);
    expect(code).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('--help prints usage that mentions ping', async () => {
    const { code, stdout } = await spawnCli(['--help']);
    expect(code).toBe(0);
    expect(stdout).toMatch(/Usage:/);
    expect(stdout).toMatch(/ping/);
  });
});
