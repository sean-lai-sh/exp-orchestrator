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

  const injectEnv = request.nextUrl.searchParams.get('inject_env') === 'true';

  let backendRes: Response;
  try {
    backendRes = await fetch(
      `${BACKEND_URL}/deploy?inject_env=${injectEnv}`,
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
