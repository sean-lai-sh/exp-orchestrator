import { describe, it, expect } from 'vitest';
import { buildDeployWorkflow } from '../deploy-types';
import type { Node, Edge } from '@xyflow/react';
import type { EditableNodeData } from '../types';

function makeNode(overrides: Partial<Node<EditableNodeData>> & { id: string }): Node<EditableNodeData> {
  return {
    position: { x: 0, y: 0 },
    type: 'editableNode',
    data: {
      name: 'Test',
      token: 'secret-token',
      access_types: {},
      nodeType: 'sender',
      sources: [],
    },
    ...overrides,
    // Merge data separately so partial overrides work
    ...(overrides.data ? { data: { ...{ name: 'Test', token: 'secret-token', access_types: {}, nodeType: 'sender', sources: [] }, ...overrides.data } } : {}),
  } as Node<EditableNodeData>;
}

function makeEdge(overrides: Partial<Edge> & { id: string; source: string; target: string }): Edge {
  return { ...overrides } as Edge;
}

describe('buildDeployWorkflow', () => {
  it('maps a basic sender node', () => {
    const nodes = [makeNode({ id: 'n1', data: { name: 'Src', token: 't', access_types: {}, nodeType: 'sender', sources: ['json'] } })];
    const result = buildDeployWorkflow(nodes, []);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({
      id: 'n1',
      type: 'sender',
      runtime: null,
      in_streams: [],
      out_streams: ['json'],
      env_vars: {},
      data: { name: 'Src' },
    });
  });

  it('excludes token from deploy data', () => {
    const nodes = [makeNode({ id: 'n1', data: { name: 'X', token: 'super-secret', access_types: {}, nodeType: 'plugin', sources: [] } })];
    const result = buildDeployWorkflow(nodes, []);

    expect(result.nodes[0].data).not.toHaveProperty('token');
  });

  it('maps edge sourceHandle to DeployEdge.data', () => {
    const edges = [makeEdge({ id: 'e1', source: 'a', target: 'b', data: { sourceHandle: 'json', color: '#000' } })];
    const result = buildDeployWorkflow([], edges);

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({ source: 'a', target: 'b', data: 'json' });
  });

  it('maps default sourceHandle to null', () => {
    const edges = [makeEdge({ id: 'e1', source: 'a', target: 'b', data: { sourceHandle: 'default', color: '#000' } })];
    const result = buildDeployWorkflow([], edges);

    expect(result.edges[0].data).toBeNull();
  });

  it('maps edge with no data to null', () => {
    const edges = [makeEdge({ id: 'e1', source: 'a', target: 'b' })];
    const result = buildDeployWorkflow([], edges);

    expect(result.edges[0].data).toBeNull();
  });

  it('propagates runtime for plugin nodes', () => {
    const nodes = [makeNode({ id: 'p1', data: { name: 'Plugin', token: 't', access_types: {}, nodeType: 'plugin', sources: [], runtime: 'my-img:latest' } })];
    const result = buildDeployWorkflow(nodes, []);

    expect(result.nodes[0].runtime).toBe('my-img:latest');
  });

  it('sets runtime to null when absent', () => {
    const nodes = [makeNode({ id: 'n1' })];
    const result = buildDeployWorkflow(nodes, []);

    expect(result.nodes[0].runtime).toBeNull();
  });

  it('maps allowedReceiveTypes to in_streams', () => {
    const nodes = [makeNode({
      id: 'n1',
      data: { name: 'R', token: 't', access_types: { allowedReceiveTypes: ['json', 'bytes'] }, nodeType: 'receiver', sources: [] },
    })];
    const result = buildDeployWorkflow(nodes, []);

    expect(result.nodes[0].in_streams).toEqual(['json', 'bytes']);
  });

  it('maps description into data bag', () => {
    const nodes = [makeNode({ id: 'n1', data: { name: 'A', description: 'hello', token: 't', access_types: {}, nodeType: 'sender', sources: [] } })];
    const result = buildDeployWorkflow(nodes, []);

    expect(result.nodes[0].data).toEqual({ name: 'A', description: 'hello' });
  });

  it('handles a multi-node pipeline', () => {
    const nodes = [
      makeNode({ id: 's', data: { name: 'Src', token: 't', access_types: {}, nodeType: 'sender', sources: ['json'] } }),
      makeNode({ id: 'p', data: { name: 'Proc', token: 't', access_types: { allowedReceiveTypes: ['json'] }, nodeType: 'plugin', sources: ['bytes'], runtime: 'img:1' } }),
      makeNode({ id: 'r', data: { name: 'Sink', token: 't', access_types: { allowedReceiveTypes: ['bytes'] }, nodeType: 'receiver', sources: [] } }),
    ];
    const edges = [
      makeEdge({ id: 'e1', source: 's', target: 'p', data: { sourceHandle: 'json', color: '#000' } }),
      makeEdge({ id: 'e2', source: 'p', target: 'r', data: { sourceHandle: 'bytes', color: '#000' } }),
    ];
    const result = buildDeployWorkflow(nodes, edges);

    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(2);
    expect(result.nodes[1]).toMatchObject({ id: 'p', type: 'plugin', runtime: 'img:1', in_streams: ['json'], out_streams: ['bytes'] });
    expect(result.edges[0]).toMatchObject({ source: 's', target: 'p', data: 'json' });
    expect(result.edges[1]).toMatchObject({ source: 'p', target: 'r', data: 'bytes' });
  });

  it('handles empty workflow', () => {
    const result = buildDeployWorkflow([], []);
    expect(result).toEqual({ nodes: [], edges: [] });
  });
});
