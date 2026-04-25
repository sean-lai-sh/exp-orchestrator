import type { Edge, Node } from '@xyflow/react';
import type { AnalysisResult } from './dag-analyzer';
import type { EditableNodeData } from './types';

export type DeployResultKind = 'success' | 'validation' | 'network' | 'unknown';

export interface DeployResult {
  kind: DeployResultKind;
  ok: boolean;
  message: string;
  analysis?: AnalysisResult;
  backendPlan?: {
    queued_plugins?: unknown[];
    topological_order?: unknown[];
    [key: string]: unknown;
  };
}

export interface DeployRequest {
  nodes: Node<EditableNodeData>[];
  edges: Edge[];
  dryRun?: boolean;
}

const DEFAULT_VALIDATION_MESSAGE = 'Backend validation failed.';
const DEFAULT_NETWORK_MESSAGE = 'Could not reach the deployment backend. Check your connection and try again.';
const DEFAULT_UNKNOWN_MESSAGE = 'Deployment failed for an unknown reason.';

function pickErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }
  const record = payload as Record<string, unknown>;
  const candidates = [record.backendError, record.details, record.message];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return fallback;
}

export async function postDeploy(
  request: DeployRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<DeployResult> {
  let response: Response;
  try {
    response = await fetchImpl('/api/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodes: request.nodes,
        edges: request.edges,
        ...(request.dryRun ? { dryRun: true } : {}),
      }),
    });
  } catch (error) {
    return {
      kind: 'network',
      ok: false,
      message: error instanceof Error && error.message ? error.message : DEFAULT_NETWORK_MESSAGE,
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const record = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const analysis = record.analysis as AnalysisResult | undefined;
  const backendPlan = record.backendPlan as DeployResult['backendPlan'];

  if (!response.ok) {
    return {
      kind: 'validation',
      ok: false,
      message: pickErrorMessage(payload, DEFAULT_VALIDATION_MESSAGE),
      analysis,
      backendPlan,
    };
  }

  if (record.success === false) {
    return {
      kind: 'unknown',
      ok: false,
      message: pickErrorMessage(payload, DEFAULT_UNKNOWN_MESSAGE),
      analysis,
      backendPlan,
    };
  }

  const baseMessage = typeof record.message === 'string' && record.message.length > 0
    ? record.message
    : 'Deployment validation passed.';

  return {
    kind: 'success',
    ok: true,
    message: baseMessage,
    analysis,
    backendPlan,
  };
}

export function summarizeDeploySuccess(result: DeployResult, mode: 'deploy' | 'validate'): string {
  if (mode === 'validate') {
    const queued = Array.isArray(result.backendPlan?.queued_plugins)
      ? result.backendPlan?.queued_plugins?.length ?? 0
      : 0;
    return `${result.message} Queued plugin deployments: ${queued}.`;
  }
  const ordered = Array.isArray(result.backendPlan?.topological_order)
    ? result.backendPlan?.topological_order?.length ?? 0
    : 0;
  return `${result.message} Planned topological steps: ${ordered}.`;
}
