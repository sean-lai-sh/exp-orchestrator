import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

const ENDPOINT_MAP: Record<string, string> = {
  plan: '/deploy',
  execute: '/deploy/execute',
  'check-images': '/deploy/check-images',
  'plan-with-allocation': '/deploy/plan',
};

// Backend endpoints that accept the `inject_env` query param.
// `/deploy/execute` and `/deploy/check-images` do not — the backend hardcodes
// or ignores env injection for those paths.
const INJECT_ENV_ENDPOINTS = new Set(['/deploy', '/deploy/plan']);

async function proxyToBackend(endpoint: string, body: unknown, params?: string) {
  const url = params ? `${BACKEND_URL}${endpoint}?${params}` : `${BACKEND_URL}${endpoint}`;
  const backendRes = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await backendRes.json().catch(() => ({ detail: 'Invalid response from backend' }));
  return NextResponse.json(data, { status: backendRes.status });
}

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

  const action = request.nextUrl.searchParams.get('action') || 'plan';
  const endpoint = ENDPOINT_MAP[action];
  if (!endpoint) {
    return NextResponse.json(
      { detail: `Unknown action '${action}'. Valid actions: ${Object.keys(ENDPOINT_MAP).join(', ')}` },
      { status: 400 }
    );
  }

  const injectEnvParam = request.nextUrl.searchParams.get('inject_env');
  const params =
    injectEnvParam !== null && INJECT_ENV_ENDPOINTS.has(endpoint)
      ? `inject_env=${injectEnvParam === 'true'}`
      : undefined;

  try {
    return await proxyToBackend(endpoint, body, params);
  } catch (error) {
    return NextResponse.json(
      { detail: `Backend unreachable at ${BACKEND_URL}: ${error instanceof Error ? error.message : 'unknown error'}` },
      { status: 502 }
    );
  }
}
