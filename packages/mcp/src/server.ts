#!/usr/bin/env node
/**
 * WindForge MCP server entry point.
 *
 * Exposes the WindForge core engine as Model Context Protocol tools
 * over stdio. stdout is reserved for the MCP protocol; all logging goes
 * to stderr via the structured logger.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from './zod-to-json-schema.js';

import { logger } from './logger.js';
import { tools } from './tools/index.js';
import type { RegisteredTool } from './tools/types.js';

interface PackageManifest {
  name: string;
  version: string;
}

const SERVER_NAME = 'windforge';

function readManifest(): PackageManifest {
  const here = dirname(fileURLToPath(import.meta.url));
  // Walk up to find package.json (works for both `dist/` and `src/` layouts).
  for (const candidate of [
    join(here, '..', 'package.json'),
    join(here, '..', '..', 'package.json'),
  ]) {
    try {
      const raw = readFileSync(candidate, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<PackageManifest>;
      if (typeof parsed.version === 'string' && typeof parsed.name === 'string') {
        return { name: parsed.name, version: parsed.version };
      }
    } catch {
      // try next
    }
  }
  return { name: '@jamieblair/windforge-mcp', version: '0.0.0' };
}

const manifest = readManifest();

function printHelp(): void {
  const lines: string[] = [];
  lines.push(`${manifest.name} v${manifest.version}`);
  lines.push('');
  lines.push('WindForge Model Context Protocol server. Exposes the wind site');
  lines.push('suitability engine to any MCP-compatible LLM client.');
  lines.push('');
  lines.push('Usage:');
  lines.push('  windforge-mcp           Run the MCP server over stdio.');
  lines.push('  windforge-mcp --help    Print this help text.');
  lines.push('  windforge-mcp --version Print the server version.');
  lines.push('');
  lines.push('Environment variables:');
  lines.push('  CDS_API_KEY    Optional Copernicus CDS API key. When set, ERA5');
  lines.push('                 (and CERRA in Europe) bias-correct NASA POWER and');
  lines.push('                 lift wind-resource confidence to high.');
  lines.push('  LOG_LEVEL      debug | info | warn | error. Default info.');
  lines.push('');
  lines.push('Tools:');
  for (const tool of tools) {
    lines.push(`  ${tool.name}`);
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

export async function runServer(transport?: StdioServerTransport): Promise<Server> {
  const server = new Server(
    { name: SERVER_NAME, version: manifest.version },
    { capabilities: { tools: {} } },
  );

  const toolMap = new Map<string, RegisteredTool>();
  for (const tool of tools) {
    toolMap.set(tool.name, tool);
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: Array.from(toolMap.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.inputSchema),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = toolMap.get(request.params.name);
    if (!tool) {
      logger.warn('unknown tool requested', { name: request.params.name });
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: { code: 'UNKNOWN_TOOL', message: `Unknown tool: ${request.params.name}` } }),
          },
        ],
      };
    }

    const parsed = tool.inputSchema.safeParse(request.params.arguments ?? {});
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`).join('; ');
      logger.warn('invalid tool input', { tool: tool.name, message });
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: { code: 'INVALID_INPUT', message } }),
          },
        ],
      };
    }

    try {
      const payload = await tool.handler(parsed.data);
      const isError = 'error' in payload;
      return {
        ...(isError ? { isError: true } : {}),
        content: [{ type: 'text', text: JSON.stringify(payload) }],
      };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unknown error';
      logger.error('tool handler threw', { tool: tool.name, message });
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: { code: 'HANDLER_THREW', message } }),
          },
        ],
      };
    }
  });

  const stdio = transport ?? new StdioServerTransport();
  await server.connect(stdio);
  logger.info('windforge mcp server connected', { version: manifest.version, tools: tools.length });
  return server;
}

function attachShutdownHandlers(server: Server): void {
  const shutdown = (signal: string): void => {
    logger.info('shutting down', { signal });
    server.close().finally(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }
  if (args.includes('--version') || args.includes('-v')) {
    process.stdout.write(`${manifest.version}\n`);
    return;
  }
  const server = await runServer();
  attachShutdownHandlers(server);
}

// Only run main when this file is executed directly, not when imported.
const invokedDirectly = (() => {
  if (typeof process.argv[1] !== 'string') return false;
  try {
    return import.meta.url === new URL(`file://${process.argv[1]}`).href;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch((error) => {
    logger.error('server failed to start', { error: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  });
}

// Re-export Zod for tests that need to construct schemas without adding a direct dep.
export { z };
