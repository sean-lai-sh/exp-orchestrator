import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { detail: 'Invalid JSON in request body' },
      { status: 400 }
    );
  }

  // executor=local launches plugin nodes via the executor (which injects env
  // vars itself via `docker run -e`). Keep inject_env=false to avoid the
  // legacy inject_vars_to_image side-effect that spawns a redundant
  // `docker compose up` container ("t-app-1") and conflicts with the
  // executor's own start. Either flag is overridable per-request via
  // query string.
  const executor = (request.nextUrl.searchParams.get('executor') ?? 'local').toLowerCase();
  const injectEnv = (request.nextUrl.searchParams.get('inject_env') ?? 'false').toLowerCase();
  const backendQuery = `executor=${encodeURIComponent(executor)}&inject_env=${encodeURIComponent(injectEnv)}`;

  // Best-effort: DELETE any deployments still active in the orchestrator
  // before creating a new one. Without this, repeated canvas-deploy clicks
  // leave orphan plugin containers running (and orphan corelink workspaces
  // bloating the corelink-server's stream-relay state).
  try {
    const listRes = await fetch(`${BACKEND_URL}/deployments`);
    if (listRes.ok) {
      const active: Record<string, unknown> = await listRes.json();
      const deployIds = Object.keys(active);
      if (deployIds.length > 0) {
        console.log('[deploy] cleaning up', deployIds.length, 'previous deployment(s) before launching new one');
        await Promise.all(
          deployIds.map((id) =>
            fetch(`${BACKEND_URL}/deployments/${id}`, { method: 'DELETE' })
              .then(() => undefined)
              .catch((e) => console.warn('[deploy] failed to DELETE deployment:', id, e)),
          ),
        );
      }
    }
  } catch (e) {
    console.warn('[deploy] previous-deployment cleanup skipped:', e);
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(
      `${BACKEND_URL}/deploy/execute/v2?${backendQuery}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
  } catch (error) {
    return NextResponse.json(
      { detail: `Backend unreachable at ${BACKEND_URL}: ${error instanceof Error ? error.message : 'unknown error'}` },
      { status: 502 }
    );
  }

  const data = await backendRes.json().catch(() => ({ detail: 'Invalid response from backend' }));
  return NextResponse.json(data, { status: backendRes.status });
}
