/**
 * Next.js API route: proxy Docker Hub image tags to the backend.
 *
 * GET /api/dockerhub/tags/<namespace>/<repo>?page=<n>
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000';

export async function GET(
  request: NextRequest,
  { params }: { params: { namespace: string; repo: string } },
) {
  const { namespace, repo } = params;
  const { searchParams } = new URL(request.url);
  const page = searchParams.get('page') ?? '1';

  try {
    const upstream = new URL(
      `${BACKEND_URL}/dockerhub/tags/${encodeURIComponent(namespace)}/${encodeURIComponent(repo)}`,
    );
    upstream.searchParams.set('page', page);

    const res = await fetch(upstream.toString(), { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend returned ${res.status}` },
        { status: 502 },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 502 },
    );
  }
}
