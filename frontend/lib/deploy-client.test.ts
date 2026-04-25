import { describe, expect, it, vi } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import type { EditableNodeData } from './types';
import { postDeploy, summarizeDeploySuccess, type DeployResult } from './deploy-client';

function makeRequest(): { nodes: Node<EditableNodeData>[]; edges: Edge[] } {
  return { nodes: [], edges: [] };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}

describe('postDeploy', () => {
  it('returns a success result when the backend accepts the workflow', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      success: true,
      valid: true,
      message: 'Frontend and backend validation both passed.',
      analysis: { valid: true, issues: [], stats: { errorCount: 0, warningCount: 0, readyToDeployCount: 1 } },
      backendPlan: { queued_plugins: [{ id: 'p-1' }, { id: 'p-2' }], topological_order: ['n-1', 'n-2', 'n-3'] },
    }));

    const result = await postDeploy(makeRequest(), fetchMock as unknown as typeof fetch);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/deploy');
    expect(result.kind).toBe('success');
    expect(result.ok).toBe(true);
    expect(result.analysis?.valid).toBe(true);
    expect(result.backendPlan?.queued_plugins).toHaveLength(2);
  });

  it('omits the dryRun flag from the body unless requested', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, message: 'ok' }));

    await postDeploy(makeRequest(), fetchMock as unknown as typeof fetch);
    const firstBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(firstBody).not.toHaveProperty('dryRun');

    await postDeploy({ ...makeRequest(), dryRun: true }, fetchMock as unknown as typeof fetch);
    const secondBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(secondBody.dryRun).toBe(true);
  });

  it('returns a validation result with the backend error message on a 400', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      success: false,
      valid: false,
      message: 'Backend validation reported blocking issues.',
      backendError: 'Plugin runtime image is not reachable from the registry.',
    }, { status: 400 }));

    const result = await postDeploy(makeRequest(), fetchMock as unknown as typeof fetch);

    expect(result.kind).toBe('validation');
    expect(result.ok).toBe(false);
    expect(result.message).toBe('Plugin runtime image is not reachable from the registry.');
  });

  it('falls back to message when backendError is missing on an error response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      success: false,
      message: 'Failed to validate workflow.',
      details: 'python3: command not found',
    }, { status: 500 }));

    const result = await postDeploy(makeRequest(), fetchMock as unknown as typeof fetch);

    expect(result.kind).toBe('validation');
    expect(result.ok).toBe(false);
    expect(result.message).toBe('python3: command not found');
  });

  it('returns a network result when fetch throws', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await postDeploy(makeRequest(), fetchMock as unknown as typeof fetch);

    expect(result.kind).toBe('network');
    expect(result.ok).toBe(false);
    expect(result.message).toBe('Failed to fetch');
  });

  it('returns a sensible default message when fetch throws a non-Error value', async () => {
    const fetchMock = vi.fn().mockRejectedValue('boom');

    const result = await postDeploy(makeRequest(), fetchMock as unknown as typeof fetch);

    expect(result.kind).toBe('network');
    expect(result.message).toMatch(/backend/i);
  });

  it('handles non-JSON error responses without throwing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('<html>500</html>', { status: 502 }));

    const result = await postDeploy(makeRequest(), fetchMock as unknown as typeof fetch);

    expect(result.kind).toBe('validation');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Backend validation failed/i);
  });

  it('treats success: false in a 200 body as a non-ok unknown result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      success: false,
      message: 'Soft failure',
    }));

    const result = await postDeploy(makeRequest(), fetchMock as unknown as typeof fetch);

    expect(result.kind).toBe('unknown');
    expect(result.ok).toBe(false);
    expect(result.message).toBe('Soft failure');
  });
});

describe('summarizeDeploySuccess', () => {
  const baseResult: DeployResult = {
    kind: 'success',
    ok: true,
    message: 'Validation passed.',
    backendPlan: { queued_plugins: [{}, {}], topological_order: ['a', 'b', 'c'] },
  };

  it('formats the validate-mode summary using queued_plugins length', () => {
    expect(summarizeDeploySuccess(baseResult, 'validate')).toBe('Validation passed. Queued plugin deployments: 2.');
  });

  it('formats the deploy-mode summary using topological_order length', () => {
    expect(summarizeDeploySuccess(baseResult, 'deploy')).toBe('Validation passed. Planned topological steps: 3.');
  });

  it('falls back to zero when backendPlan fields are missing', () => {
    const result: DeployResult = { kind: 'success', ok: true, message: 'ok' };
    expect(summarizeDeploySuccess(result, 'validate')).toBe('ok Queued plugin deployments: 0.');
    expect(summarizeDeploySuccess(result, 'deploy')).toBe('ok Planned topological steps: 0.');
  });
});
