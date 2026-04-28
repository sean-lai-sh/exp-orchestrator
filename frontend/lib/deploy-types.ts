import type { Node, Edge } from '@xyflow/react';
import type { EditableNodeData } from './types';

// Mirrors backend/workflow_types.py StreamCredential (line 33)
export interface StreamCredential {
  workspace: string;
  protocol?: string;
  stream_id: string;
  data_type: string;
  metadata?: Record<string, any>;
}

// Mirrors backend/workflow_types.py DeployNode (line 41)
export interface DeployNode {
  id: string;
  type: string;
  runtime?: string | null;
  in_streams?: string[];
  out_streams?: string[];
  in_creds?: Record<string, StreamCredential>;
  out_creds?: Record<string, StreamCredential>;
  env_vars?: Record<string, string>;
  data?: Record<string, any>;
}

// Mirrors backend/workflow_types.py DeployEdge (line 53)
export interface DeployEdge {
  source: string;
  target: string;
  data?: string | null;
}

// Mirrors backend/workflow_types.py DeployWorkflow (line 59)
export interface DeployWorkflow {
  nodes: DeployNode[];
  edges: DeployEdge[];
}

export interface DeployResponse {
  message: string;
  node_count: number;
  edge_count: number;
  topological_order: string[];
  dag_graph: Record<string, string[]>;
  queued_plugins: string[];
  assigned_nodes: string[];
  adjacency_list: Record<string, string[]>;
  env_plan: Record<string, Record<string, string>>;
  credentials_by_node: Record<string, {
    in_creds: Record<string, StreamCredential>;
    out_creds: Record<string, StreamCredential>;
  }>;
  injected_nodes?: string[];
  skipped_nodes?: Array<{ node_id: string; reason: string }>;
}

export interface ValidationErrorDetail {
  loc: (string | number)[];
  msg: string;
  type: string;
}

export interface DeployErrorResponse {
  detail: string | ValidationErrorDetail[];
}

export function buildDeployWorkflow(
  nodes: Node<EditableNodeData>[],
  edges: Edge[]
): DeployWorkflow {
  const deployNodes: DeployNode[] = nodes.map(n => ({
    id: n.id,
    type: n.data.nodeType,
    runtime: n.data.runtime || null,
    in_streams: n.data.access_types?.allowedReceiveTypes || [],
    out_streams: n.data.sources || [],
    env_vars: {},
    data: {
      name: n.data.name,
      ...(n.data.description ? { description: n.data.description } : {}),
    },
  }));

  const deployEdges: DeployEdge[] = edges.map(e => {
    const handle = (e.data?.sourceHandle as string) || (e.sourceHandle as string) || null;
    return {
      source: e.source,
      target: e.target,
      data: handle && handle !== 'default' ? handle : null,
    };
  });

  return { nodes: deployNodes, edges: deployEdges };
}
