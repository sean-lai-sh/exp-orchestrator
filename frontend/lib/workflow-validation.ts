import type { Edge, Node } from '@xyflow/react';
import type { EditableNodeData, NodeType } from './types';

export interface BackendDeployNode {
  id: string;
  type: NodeType;
  runtime?: string;
  in_streams: string[];
  out_streams: string[];
  data: Record<string, unknown>;
}

export interface BackendDeployEdge {
  source: string;
  target: string;
  data?: string;
}

export interface BackendDeployWorkflow {
  nodes: BackendDeployNode[];
  edges: BackendDeployEdge[];
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

export function getNodeRuntime(nodeOrData: Node<EditableNodeData> | EditableNodeData): string | undefined {
  const data = 'data' in nodeOrData ? nodeOrData.data : nodeOrData;

  const runtimeCandidates = [
    data.runtime,
    data.containerImage,
    data.image,
    data?.deploymentMetadata?.localConfig?.containerImage,
  ];

  const runtime = runtimeCandidates.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0);
  return typeof runtime === 'string' ? runtime.trim() : undefined;
}

export function getNodeInputTypes(node: Node<EditableNodeData>): string[] {
  return normalizeStringArray(node.data.in_streams).length > 0
    ? normalizeStringArray(node.data.in_streams)
    : normalizeStringArray(node.data.access_types?.allowedReceiveTypes);
}

export function getNodeOutputTypes(node: Node<EditableNodeData>): string[] {
  return normalizeStringArray(node.data.out_streams).length > 0
    ? normalizeStringArray(node.data.out_streams)
    : normalizeStringArray(node.data.access_types?.allowedSendTypes);
}

export function getEdgeStreamType(edge: Edge): string {
  const data = edge.data as unknown;

  if (typeof data === 'string' && data.trim()) {
    return data.trim();
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    const candidate = record.streamType ?? record.dataType ?? record.label;

    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return 'json';
}

export function toBackendDeployWorkflow(
  nodes: Node<EditableNodeData>[],
  edges: Edge[],
): BackendDeployWorkflow {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.data.nodeType,
      runtime: getNodeRuntime(node),
      in_streams: getNodeInputTypes(node),
      out_streams: getNodeOutputTypes(node),
      data: { ...node.data },
    })),
    edges: edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      data: getEdgeStreamType(edge),
    })),
  };
}
