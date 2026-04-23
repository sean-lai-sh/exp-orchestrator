/**
 * Next.js API route: proxy Docker Hub image search to the backend.
 *
 * GET /api/dockerhub/search?query=<term>&page=<n>&page_size=<n>
 *
 * Forwards the request to the Python backend which handles CORS and allowlist annotation.
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query') ?? '';
  const page = searchParams.get('page') ?? '1';
  const pageSize = searchParams.get('page_size') ?? '20';

  if (!query.trim()) {
    return NextResponse.json({ count: 0, results: [] });
  }

  try {
    const upstream = new URL(`${BACKEND_URL}/dockerhub/search`);
    upstream.searchParams.set('query', query);
    upstream.searchParams.set('page', page);
    upstream.searchParams.set('page_size', pageSize);

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
