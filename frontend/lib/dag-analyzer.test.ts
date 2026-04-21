import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import type { EditableNodeData } from './types';
import { analyzeDAG } from './dag-analyzer';
import { toBackendDeployWorkflow } from './workflow-validation';

function makeNode(
  id: string,
  nodeType: EditableNodeData['nodeType'],
  overrides: Partial<EditableNodeData> = {},
): Node<EditableNodeData> {
  return {
    id,
    type: nodeType,
    position: { x: 0, y: 0 },
    data: {
      name: `${nodeType}-${id}`,
      description: '',
      token: `token-${id}`,
      nodeType,
      sources: nodeType === 'receiver' ? [] : ['json'],
      runtime: nodeType === 'plugin' ? 'ghcr.io/acme/plugin:latest' : undefined,
      access_types: {
        canSend: nodeType !== 'receiver',
        canReceive: nodeType !== 'sender',
        allowedSendTypes: nodeType === 'receiver' ? [] : ['json'],
        allowedReceiveTypes: nodeType === 'sender' ? [] : ['json'],
      },
      ...overrides,
    },
  };
}

function makeEdge(id: string, source: string, target: string, streamType = 'json'): Edge {
  return {
    id,
    source,
    target,
    data: { streamType },
  };
}

describe('analyzeDAG', () => {
  it('marks a simple sender -> plugin -> receiver workflow as valid', () => {
    const nodes = [
      makeNode('sender-1', 'sender'),
      makeNode('plugin-1', 'plugin'),
      makeNode('receiver-1', 'receiver'),
    ];
    const edges = [
      makeEdge('edge-1', 'sender-1', 'plugin-1'),
      makeEdge('edge-2', 'plugin-1', 'receiver-1'),
    ];

    const result = analyzeDAG(nodes, edges);

    expect(result.valid).toBe(true);
    expect(result.stats.errorCount).toBe(0);
    expect(result.stats.readyToDeployCount).toBe(1);
  });

  it('reports cycles as blocking errors', () => {
    const nodes = [
      makeNode('plugin-a', 'plugin'),
      makeNode('plugin-b', 'plugin'),
    ];
    const edges = [
      makeEdge('edge-a', 'plugin-a', 'plugin-b'),
      makeEdge('edge-b', 'plugin-b', 'plugin-a'),
    ];

    const result = analyzeDAG(nodes, edges);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.category === 'cycle' && issue.severity === 'error')).toBe(true);
  });

  it('reports invalid receiver outbound connections and missing runtime images', () => {
    const nodes = [
      makeNode('receiver-1', 'receiver'),
      makeNode('plugin-1', 'plugin', { runtime: '' }),
    ];
    const edges = [makeEdge('edge-1', 'receiver-1', 'plugin-1')];

    const result = analyzeDAG(nodes, edges);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.category === 'connection' && issue.message.includes('Receiver nodes cannot have outbound connections'))).toBe(true);
    expect(result.issues.some((issue) => issue.category === 'runtime' && issue.message.includes('missing a runtime image'))).toBe(true);
  });

  it('reports stream incompatibility when an edge data type is not accepted', () => {
    const nodes = [
      makeNode('sender-1', 'sender', {
        access_types: {
          canSend: true,
          canReceive: false,
          allowedSendTypes: ['json'],
          allowedReceiveTypes: [],
        },
      }),
      makeNode('receiver-1', 'receiver', {
        access_types: {
          canSend: false,
          canReceive: true,
          allowedSendTypes: [],
          allowedReceiveTypes: ['text'],
        },
      }),
    ];
    const edges = [makeEdge('edge-1', 'sender-1', 'receiver-1', 'json')];

    const result = analyzeDAG(nodes, edges);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.category === 'stream')).toBe(true);
  });
});

describe('toBackendDeployWorkflow', () => {
  it('maps frontend nodes and edges into backend deployment payloads', () => {
    const nodes = [
      makeNode('sender-1', 'sender'),
      makeNode('plugin-1', 'plugin', { runtime: 'ghcr.io/acme/plugin:v1' }),
    ];
    const edges = [makeEdge('edge-1', 'sender-1', 'plugin-1', 'json')];

    const workflow = toBackendDeployWorkflow(nodes, edges);

    expect(workflow.nodes).toHaveLength(2);
    expect(workflow.nodes[1]).toMatchObject({
      id: 'plugin-1',
      type: 'plugin',
      runtime: 'ghcr.io/acme/plugin:v1',
      in_streams: ['json'],
      out_streams: ['json'],
    });
    expect(workflow.edges[0]).toEqual({
      source: 'sender-1',
      target: 'plugin-1',
      data: 'json',
    });
  });
});
