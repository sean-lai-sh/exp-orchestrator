import type { Edge, Node } from '@xyflow/react';
import type { AnalysisResult } from './dag-analyzer';
import type { EditableNodeData } from './types';

export type DeployOutcomeKind = 'success' | 'validation_error' | 'server_error' | 'network_error' | 'timeout';

export interface DeployOutcome {
  kind: DeployOutcomeKind;
  ok: boolean;
  message: string;
  analysis?: AnalysisResult;
  backendPlan?: {
    topological_order?: unknown[];
    queued_plugins?: unknown[];
    [key: string]: unknown;
  };
  status?: number;
  details?: string;
}

export interface RunDeployOptions {
  nodes: Node<EditableNodeData>[];
  edges: Edge[];
  dryRun?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  endpoint?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_ENDPOINT = '/api/deploy';

function pickBackendMessage(result: Record<string, unknown> | null): string | null {
  if (!result) {
    return null;
  }
  const candidates = ['backendError', 'message', 'details'];
  for (const key of candidates) {
    const value = result[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

export async function runDeploy(options: RunDeployOptions): Promise<DeployOutcome> {
  const {
    nodes,
    edges,
    dryRun = false,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
    endpoint = DEFAULT_ENDPOINT,
  } = options;

  const controller = new AbortController();
  const timeoutHandle = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let externalAbortHandler: (() => void) | null = null;
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      externalAbortHandler = () => controller.abort();
      signal.addEventListener('abort', externalAbortHandler);
    }
  }

  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodes, edges, dryRun }),
      signal: controller.signal,
    });

    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = (await response.json()) as Record<string, unknown>;
    } catch {
      parsed = null;
    }

    const analysis = (parsed?.analysis as AnalysisResult | undefined) ?? undefined;
    const backendPlan = (parsed?.backendPlan as DeployOutcome['backendPlan']) ?? undefined;

    if (!response.ok) {
      const backendMessage = pickBackendMessage(parsed);
      const isClientError = response.status >= 400 && response.status < 500;
      return {
        kind: isClientError ? 'validation_error' : 'server_error',
        ok: false,
        status: response.status,
        message: backendMessage ?? (isClientError ? 'Workflow failed validation.' : 'Deployment failed unexpectedly.'),
        analysis,
        details: typeof parsed?.details === 'string' ? parsed.details : undefined,
      };
    }

    const baseMessage = (typeof parsed?.message === 'string' && parsed.message) || 'Deployment validated successfully.';
    const queuedPlugins = backendPlan?.queued_plugins?.length ?? 0;
    const orderedNodes = backendPlan?.topological_order?.length ?? 0;
    const summary = dryRun
      ? `${baseMessage} Queued plugin deployments: ${queuedPlugins}.`
      : `${baseMessage} Planned topological steps: ${orderedNodes}.`;

    return {
      kind: 'success',
      ok: true,
      status: response.status,
      message: summary,
      analysis,
      backendPlan,
    };
  } catch (error) {
    const aborted = error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
    if (aborted) {
      const externallyAborted = signal?.aborted === true;
      return {
        kind: 'timeout',
        ok: false,
        message: externallyAborted
          ? 'Deployment cancelled before it completed.'
          : `Deployment timed out after ${Math.round(timeoutMs / 1000)}s. The backend may be unreachable.`,
      };
    }
    return {
      kind: 'network_error',
      ok: false,
      message: error instanceof Error
        ? `Network error reaching deployment service: ${error.message}`
        : 'Network error reaching deployment service.',
    };
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    if (signal && externalAbortHandler) {
      signal.removeEventListener('abort', externalAbortHandler);
    }
  }
}
