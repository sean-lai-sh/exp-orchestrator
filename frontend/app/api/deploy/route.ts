import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

const ENDPOINT_MAP: Record<string, string> = {
  plan: '/deploy',
  execute: '/deploy/execute',
  'check-images': '/deploy/check-images',
  'plan-with-allocation': '/deploy/plan',
};

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

  const injectEnv = request.nextUrl.searchParams.get('inject_env') === 'true';
  const params = endpoint === '/deploy' ? `inject_env=${injectEnv}` : undefined;

  try {
    return await proxyToBackend(endpoint, body, params);
  } catch (error) {
    return NextResponse.json(
      { detail: `Backend unreachable at ${BACKEND_URL}: ${error instanceof Error ? error.message : 'unknown error'}` },
      { status: 502 }
    );
  }
}
