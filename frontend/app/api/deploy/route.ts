import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const injectEnv = request.nextUrl.searchParams.get('inject_env') === 'true';

    const backendRes = await fetch(
      `${BACKEND_URL}/deploy?inject_env=${injectEnv}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    const data = await backendRes.json();
    return NextResponse.json(data, { status: backendRes.status });
  } catch (error) {
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : 'Proxy error' },
      { status: 502 }
    );
  }
}
