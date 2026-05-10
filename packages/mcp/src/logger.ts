/**
 * Stderr-only structured JSON-line logger for MCP server.
 *
 * stdout is reserved for the MCP protocol when using the stdio transport.
 * Writing log output to stdout corrupts the protocol stream and breaks
 * every connected client.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return 'info';
}

const activeLevel: LogLevel = resolveLevel();

function emit(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[activeLevel]) return;
  const entry: Record<string, unknown> = {
    time: new Date().toISOString(),
    level,
    msg: message,
  };
  if (fields) {
    for (const [key, value] of Object.entries(fields)) {
      entry[key] = value;
    }
  }
  process.stderr.write(`${JSON.stringify(entry)}\n`);
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>): void => emit('debug', message, fields),
  info: (message: string, fields?: Record<string, unknown>): void => emit('info', message, fields),
  warn: (message: string, fields?: Record<string, unknown>): void => emit('warn', message, fields),
  error: (message: string, fields?: Record<string, unknown>): void => emit('error', message, fields),
};
