/* eslint-disable no-console */
import { env } from '../config/env';

type Level = 'debug' | 'info' | 'warn' | 'error';

const ESC = String.fromCharCode(27);
const COLORS: Record<Level, string> = {
  debug: `${ESC}[90m`,
  info: `${ESC}[36m`,
  warn: `${ESC}[33m`,
  error: `${ESC}[31m`,
};
const BOLD = `${ESC}[1m`;
const RESET = `${ESC}[0m`;

function emit(level: Level, scope: string, message: string, meta?: unknown): void {
  if (level === 'debug' && !env.isDevelopment) return;

  const timestamp = new Date().toISOString();
  const prefix = `${COLORS[level]}[${timestamp}] ${level.toUpperCase().padEnd(5)}${RESET} ${BOLD}${scope}${RESET}`;

  if (meta === undefined) console.log(`${prefix} ${message}`);
  else console.log(`${prefix} ${message}`, meta);
}

/** Minimal structured logger. Swap the `emit` body for pino/winston later. */
export function createLogger(scope: string) {
  return {
    debug: (message: string, meta?: unknown) => emit('debug', scope, message, meta),
    info: (message: string, meta?: unknown) => emit('info', scope, message, meta),
    warn: (message: string, meta?: unknown) => emit('warn', scope, message, meta),
    error: (message: string, meta?: unknown) => emit('error', scope, message, meta),
  };
}

export const logger = createLogger('tims');
