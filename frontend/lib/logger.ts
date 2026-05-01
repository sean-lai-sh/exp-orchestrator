/**
 * Tiny leveled logger.
 *
 * - Browser/dev: pretty console output preserving call sites and stack traces.
 * - Server (Next API routes, Node runtime): structured JSON to stdout.
 *
 * Caveats:
 * - Only `NEXT_PUBLIC_*` env vars are inlined into the client bundle, so
 *   `LOG_LEVEL` is honored only on the server. In the browser, level
 *   defaults to "info" regardless of the env var.
 * - `process.stdout.write` is Node-only. If a route opts in to the Edge
 *   runtime (`export const runtime = 'edge'`), switch to `console.log`
 *   there or guard this branch.
 *
 * Pass `extra` for structured fields rather than concatenating strings.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const isServer = typeof window === 'undefined';

const ACTIVE_LEVEL: Level = (() => {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw;
  return 'info';
})();

function emit(level: Level, msg: string, extra?: Record<string, unknown>) {
  if (LEVEL_RANK[level] < LEVEL_RANK[ACTIVE_LEVEL]) return;

  if (isServer && typeof process !== 'undefined' && process.stdout?.write) {
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
