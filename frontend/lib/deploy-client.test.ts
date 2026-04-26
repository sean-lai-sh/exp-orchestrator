import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import type { EditableNodeData } from './types';
import { runDeploy } from './deploy-client';

function nodes(): Node<EditableNodeData>[] {
  return [
    {
      id: 'n1',
      type: 'sender',
      position: { x: 0, y: 0 },
      data: {
        name: 'sender',
        description: '',
        token: 'tok',
        nodeType: 'sender',
        sources: ['json'],
        access_types: { canSend: true, canReceive: false, allowedSendTypes: ['json'], allowedReceiveTypes: [] },
      },
    },
  ];
}

function edges(): Edge[] {
  return [];
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runDeploy', () => {
  it('returns a success outcome with summary message for a 200 dry run', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      success: true,
      valid: true,
      message: 'Frontend and backend validation both passed.',
      analysis: { valid: true, issues: [], stats: { errorCount: 0, readyToDeployCount: 1 } },
      backendPlan: { queued_plugins: [{ id: 'p1' }, { id: 'p2' }] },
    }));

    const outcome = await runDeploy({ nodes: nodes(), edges: edges(), dryRun: true, fetchImpl });

    expect(outcome.kind).toBe('success');
    expect(outcome.ok).toBe(true);
    expect(outcome.status).toBe(200);
    expect(outcome.message).toContain('Queued plugin deployments: 2');
    expect(outcome.analysis?.valid).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.dryRun).toBe(true);
    expect(body.nodes).toHaveLength(1);
  });

  it('returns success but exposes analysis.valid=false when the backend passes but the analyzer does not', async () => {
    // The deploy route responds 200 in this case (see frontend/app/api/deploy/route.ts);
    // the client must surface analysis.valid so callers can avoid a false success toast.
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      success: true,
      valid: false,
      message: 'Backend validation passed, but the frontend analyzer still found deploy blockers or warnings.',
      analysis: { valid: false, issues: [{ severity: 'error' }], stats: { errorCount: 1, readyToDeployCount: 0 } },
      backendPlan: { topological_order: [], queued_plugins: [] },
    }));

    const outcome = await runDeploy({ nodes: nodes(), edges: edges(), fetchImpl });

    expect(outcome.kind).toBe('success');
    expect(outcome.ok).toBe(true);
    expect(outcome.analysis?.valid).toBe(false);
  });

  it('reports backend validation errors with the backend message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      success: false,
      valid: false,
      message: 'Backend validation reported blocking issues.',
      backendError: 'plugin runtime image is not on the allowlist',
      analysis: { valid: false, issues: [], stats: { errorCount: 1, readyToDeployCount: 0 } },
    }, { status: 400 }));

    const outcome = await runDeploy({ nodes: nodes(), edges: edges(), fetchImpl });

    expect(outcome.kind).toBe('validation_error');
    expect(outcome.ok).toBe(false);
    expect(outcome.status).toBe(400);
    expect(outcome.message).toBe('plugin runtime image is not on the allowlist');
    expect(outcome.analysis?.valid).toBe(false);
  });

  it('classifies 5xx responses as server errors and surfaces details', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      success: false,
      message: 'Failed to validate workflow.',
      details: 'spawn python3 ENOENT',
    }, { status: 500 }));

    const outcome = await runDeploy({ nodes: nodes(), edges: edges(), fetchImpl });

    expect(outcome.kind).toBe('server_error');
    expect(outcome.ok).toBe(false);
    expect(outcome.status).toBe(500);
    expect(outcome.message).toBe('Failed to validate workflow.');
    expect(outcome.details).toBe('spawn python3 ENOENT');
  });

  it('returns a network_error outcome when fetch rejects', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const outcome = await runDeploy({ nodes: nodes(), edges: edges(), fetchImpl });

    expect(outcome.kind).toBe('network_error');
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain('Failed to fetch');
  });

  it('returns a timeout outcome when the request is aborted by the internal timer', async () => {
    const fetchImpl = vi.fn().mockImplementation((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }),
    );

    const outcome = await runDeploy({ nodes: nodes(), edges: edges(), fetchImpl, timeoutMs: 5 });

    expect(outcome.kind).toBe('timeout');
    expect(outcome.message).toMatch(/timed out/i);
  });

  it('treats an externally-provided aborted signal as a cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn().mockImplementation((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        const handler = () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        };
        if (init.signal?.aborted) {
          handler();
          return;
        }
        init.signal?.addEventListener('abort', handler);
      }),
    );

    const outcome = await runDeploy({
      nodes: nodes(),
      edges: edges(),
      signal: controller.signal,
      fetchImpl,
    });

    expect(outcome.kind).toBe('timeout');
    expect(outcome.message).toMatch(/cancelled/i);
  });

  it('falls back to a default message when the backend returns no usable text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, { status: 422 }));

    const outcome = await runDeploy({ nodes: nodes(), edges: edges(), fetchImpl });

    expect(outcome.kind).toBe('validation_error');
    expect(outcome.message).toBe('Workflow failed validation.');
  });
});
