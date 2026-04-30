/**
 * Tiny leveled logger.
 *
 * - Browser/dev: pretty console output preserving call sites and stack traces.
 * - Server (Next API routes): structured JSON to stdout for log aggregators.
 *
 * Pass `extra` for structured fields rather than concatenating strings.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function envLevel(): Level {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw;
  return 'info';
}

const isServer = typeof window === 'undefined';

function emit(level: Level, msg: string, extra?: Record<string, unknown>) {
  if (LEVEL_RANK[level] < LEVEL_RANK[envLevel()]) return;

  if (isServer) {
    const payload = { ts: new Date().toISOString(), level, msg, ...(extra ?? {}) };
    process.stdout.write(JSON.stringify(payload) + '\n');
    return;
  }

  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (extra) fn(`[${level}] ${msg}`, extra);
  else fn(`[${level}] ${msg}`);
}

export const logger = {
  debug: (msg: string, extra?: Record<string, unknown>) => emit('debug', msg, extra),
  info: (msg: string, extra?: Record<string, unknown>) => emit('info', msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => emit('warn', msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => emit('error', msg, extra),
};
