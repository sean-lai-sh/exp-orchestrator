import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/health/corelink`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json({
      backend: 'reachable',
      backend_url: BACKEND_URL,
      corelink: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        backend: 'unreachable',
        backend_url: BACKEND_URL,
        error: error instanceof Error ? error.message : 'unknown error',
      },
      { status: 502 }
    );
  }
}
