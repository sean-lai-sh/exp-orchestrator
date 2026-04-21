import type { Edge, Node } from '@xyflow/react';
import type { EditableNodeData } from './types';
import {
  getEdgeStreamType,
  getNodeInputTypes,
  getNodeOutputTypes,
  getNodeRuntime,
} from './workflow-validation';

export type AnalyzerSeverity = 'error' | 'warning' | 'info';
export type AnalyzerCategory = 'cycle' | 'connection' | 'runtime' | 'stream' | 'readiness';

export interface AnalyzerIssue {
  severity: AnalyzerSeverity;
  category: AnalyzerCategory;
  nodeIds: string[];
  edgeIds?: string[];
  message: string;
  fix?: string;
}

export interface AnalysisResult {
  valid: boolean;
  issues: AnalyzerIssue[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    pluginCount: number;
    readyToDeployCount: number;
    errorCount: number;
    warningCount: number;
  };
}

function nodeTypeOf(node: Node<EditableNodeData>): string {
  return node.data.nodeType || node.type || 'plugin';
}

function runtimeApprovalStatus(node: Node<EditableNodeData>): 'approved' | 'unapproved' | 'missing' {
  const runtime = getNodeRuntime(node);
  if (!runtime) {
    return 'missing';
  }

  if (node.data.runtimeApproved === false) {
    return 'unapproved';
  }

  const approval = typeof node.data.runtimeApprovalStatus === 'string'
    ? node.data.runtimeApprovalStatus.toLowerCase()
    : typeof node.data.approvalStatus === 'string'
      ? node.data.approvalStatus.toLowerCase()
      : 'approved';

  return approval === 'approved' ? 'approved' : 'unapproved';
}

export function detectCycles(
  nodes: Node<EditableNodeData>[],
  edges: Edge[],
): AnalyzerIssue[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const graph = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  nodes.forEach((node) => {
    graph.set(node.id, []);
    indegree.set(node.id, 0);
  });

  edges.forEach((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      return;
    }

    graph.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  });

  const queue = nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  const order: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);

    for (const next of graph.get(current) ?? []) {
      const nextDegree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextDegree);
      if (nextDegree === 0) {
        queue.push(next);
      }
    }
  }

  if (order.length === nodes.length) {
    return [];
  }

  const cycleNodeIds = nodes
    .map((node) => node.id)
    .filter((nodeId) => !order.includes(nodeId));
  const cycleEdgeIds = edges
    .filter((edge) => cycleNodeIds.includes(edge.source) && cycleNodeIds.includes(edge.target))
    .map((edge) => edge.id);

  return [{
    severity: 'error',
    category: 'cycle',
    nodeIds: cycleNodeIds,
    edgeIds: cycleEdgeIds,
    message: `Cycle detected across ${cycleNodeIds.length} node(s). Backend deployment requires a DAG.`,
    fix: 'Remove or reroute at least one connection in the highlighted cycle.',
  }];
}

export function detectOrphans(
  nodes: Node<EditableNodeData>[],
  edges: Edge[],
): AnalyzerIssue[] {
  const connectedNodeIds = new Set<string>();
  edges.forEach((edge) => {
    connectedNodeIds.add(edge.source);
    connectedNodeIds.add(edge.target);
  });

  return nodes
    .filter((node) => !connectedNodeIds.has(node.id))
    .map((node) => ({
      severity: 'warning' as const,
      category: 'readiness' as const,
      nodeIds: [node.id],
      message: `${node.data.name || node.id} is orphaned and will not participate in the workflow.`,
      fix: 'Connect the node to the graph or remove it before deployment.',
    }));
}

export function validateConnections(
  nodes: Node<EditableNodeData>[],
  edges: Edge[],
): AnalyzerIssue[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const issues: AnalyzerIssue[] = [];

  for (const edge of edges) {
    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);
    if (!sourceNode || !targetNode) {
      continue;
    }

    const sourceType = nodeTypeOf(sourceNode);
    const targetType = nodeTypeOf(targetNode);

    if (sourceType === 'receiver') {
      issues.push({
        severity: 'error',
        category: 'connection',
        nodeIds: [sourceNode.id, targetNode.id],
        edgeIds: [edge.id],
        message: 'Receiver nodes cannot have outbound connections.',
        fix: 'Connect into the receiver instead of routing data out of it.',
      });
    }

    if (targetType === 'sender') {
      issues.push({
        severity: 'error',
        category: 'connection',
        nodeIds: [sourceNode.id, targetNode.id],
        edgeIds: [edge.id],
        message: 'Sender nodes cannot accept inbound connections.',
        fix: 'Route the connection into a plugin or receiver node instead.',
      });
    }

    if (edge.source === edge.target) {
      issues.push({
        severity: 'error',
        category: 'connection',
        nodeIds: [edge.source],
        edgeIds: [edge.id],
        message: 'Self-referential edges are not allowed.',
        fix: 'Remove the self-loop and connect the node to a different downstream node.',
      });
    }

    if (sourceNode.data.access_types?.canSend === false) {
      issues.push({
        severity: 'error',
        category: 'connection',
        nodeIds: [sourceNode.id],
        edgeIds: [edge.id],
        message: `${sourceNode.data.name || sourceNode.id} is marked as unable to send data.`,
        fix: 'Enable sending for the node or remove the outgoing edge.',
      });
    }

    if (targetNode.data.access_types?.canReceive === false) {
      issues.push({
        severity: 'error',
        category: 'connection',
        nodeIds: [targetNode.id],
        edgeIds: [edge.id],
        message: `${targetNode.data.name || targetNode.id} is marked as unable to receive data.`,
        fix: 'Enable receiving for the node or choose a different target.',
      });
    }
  }

  return issues;
}

export function checkMissingRuntime(nodes: Node<EditableNodeData>[]): AnalyzerIssue[] {
  const issues: AnalyzerIssue[] = [];

  for (const node of nodes) {
    if (nodeTypeOf(node) !== 'plugin') {
      continue;
    }

    const runtimeStatus = runtimeApprovalStatus(node);
    if (runtimeStatus === 'missing') {
      issues.push({
        severity: 'error',
        category: 'runtime',
        nodeIds: [node.id],
        message: `${node.data.name || node.id} is missing a runtime image.`,
        fix: 'Set runtime or container image information before deployment.',
      });
      continue;
    }

    if (runtimeStatus === 'unapproved') {
      issues.push({
        severity: 'warning',
        category: 'runtime',
        nodeIds: [node.id],
        message: `${node.data.name || node.id} uses an unapproved runtime image.`,
        fix: 'Switch to an approved runtime or explicitly approve this image before deploying.',
      });
    }
  }

  return issues;
}

export function checkStreamCompatibility(
  nodes: Node<EditableNodeData>[],
  edges: Edge[],
): AnalyzerIssue[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const issues: AnalyzerIssue[] = [];

  for (const edge of edges) {
    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);
    if (!sourceNode || !targetNode) {
      continue;
    }

    const streamType = getEdgeStreamType(edge);
    const outputTypes = getNodeOutputTypes(sourceNode);
    const inputTypes = getNodeInputTypes(targetNode);

    if (outputTypes.length > 0 && !outputTypes.includes(streamType)) {
      issues.push({
        severity: 'error',
        category: 'stream',
        nodeIds: [sourceNode.id, targetNode.id],
        edgeIds: [edge.id],
        message: `${sourceNode.data.name || sourceNode.id} does not declare ${streamType} as an output stream.`,
        fix: 'Adjust the edge data type or update the source node output stream declarations.',
      });
    }

    if (inputTypes.length > 0 && !inputTypes.includes(streamType)) {
      issues.push({
        severity: 'error',
        category: 'stream',
        nodeIds: [sourceNode.id, targetNode.id],
        edgeIds: [edge.id],
        message: `${targetNode.data.name || targetNode.id} does not accept ${streamType} as an input stream.`,
        fix: 'Adjust the edge data type or update the destination node input stream declarations.',
      });
    }
  }

  return issues;
}

export function checkDanglingEdges(
  nodes: Node<EditableNodeData>[],
  edges: Edge[],
): AnalyzerIssue[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const issues: AnalyzerIssue[] = [];

  for (const edge of edges) {
    const missingEndpoints = [edge.source, edge.target].filter((nodeId) => !nodeIds.has(nodeId));
    if (missingEndpoints.length === 0) {
      continue;
    }

    issues.push({
      severity: 'error',
      category: 'connection',
      nodeIds: missingEndpoints,
      edgeIds: [edge.id],
      message: `Edge ${edge.id} references missing node IDs: ${missingEndpoints.join(', ')}.`,
      fix: 'Delete the dangling edge or restore the missing node.',
    });
  }

  return issues;
}

function computeStats(
  nodes: Node<EditableNodeData>[],
  edges: Edge[],
  issues: AnalyzerIssue[],
): AnalysisResult['stats'] {
  const plugins = nodes.filter((node) => nodeTypeOf(node) === 'plugin');
  const blockingNodeIds = new Set(
    issues
      .filter((issue) => issue.severity === 'error')
      .flatMap((issue) => issue.nodeIds),
  );

  const readyToDeployCount = plugins.filter((node) => {
    const runtime = getNodeRuntime(node);
    return Boolean(runtime) && !blockingNodeIds.has(node.id);
  }).length;

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    pluginCount: plugins.length,
    readyToDeployCount,
    errorCount: issues.filter((issue) => issue.severity === 'error').length,
    warningCount: issues.filter((issue) => issue.severity === 'warning').length,
  };
}

export function analyzeDAG(
  nodes: Node<EditableNodeData>[],
  edges: Edge[],
): AnalysisResult {
  const issues = [
    ...checkDanglingEdges(nodes, edges),
    ...detectCycles(nodes, edges),
    ...detectOrphans(nodes, edges),
    ...validateConnections(nodes, edges),
    ...checkMissingRuntime(nodes),
    ...checkStreamCompatibility(nodes, edges),
  ];

  const uniqueIssues = issues.filter((issue, index) => {
    const key = JSON.stringify({
      severity: issue.severity,
      category: issue.category,
      nodeIds: [...issue.nodeIds].sort(),
      edgeIds: [...(issue.edgeIds ?? [])].sort(),
      message: issue.message,
    });

    return index === issues.findIndex((candidate) => {
      const candidateKey = JSON.stringify({
        severity: candidate.severity,
        category: candidate.category,
        nodeIds: [...candidate.nodeIds].sort(),
        edgeIds: [...(candidate.edgeIds ?? [])].sort(),
        message: candidate.message,
      });
      return candidateKey === key;
    });
  });

  return {
    valid: uniqueIssues.every((issue) => issue.severity !== 'error'),
    issues: uniqueIssues,
    stats: computeStats(nodes, edges, uniqueIssues),
  };
}
