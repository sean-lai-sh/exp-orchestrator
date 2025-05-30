'use client';

import { useCallback } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Node,
  Edge,
  Connection,
  addEdge,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  XYPosition,
  Panel,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStorage, useMutation, useRoom } from '../../app/liveblocks.config';
import type { NodeData, StorageNodeData, StorageEdgeData } from '../../app/liveblocks.config';
import { LiveObject } from '@liveblocks/client';
import CustomNode from './CustomNode';

const nodeTypes = {
  custom: CustomNode,
};

// Default edge style
const defaultEdgeOptions = {
  animated: true,
  type: 'default',
  style: { stroke: '#4b5563', strokeWidth: 2 },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: '#4b5563',
  },
};

type FlowNode = Node<NodeData>;

const initialNodes: FlowNode[] = [];
const initialEdges: Edge[] = [];

// Define a new component to contain the main React Flow logic
// This is good practice when using ReactFlowProvider, so that hooks like useReactFlow can be used inside CanvasContents
function CanvasContents() {
  const room = useRoom();
  const storageStatus = room.getStorageStatus();
  const isStorageLoading = storageStatus !== "synchronized";

  const nodes = useStorage((root) => {
    return (root.nodes ?? [])
      .filter((liveNode): liveNode is LiveObject<StorageNodeData> => 
        liveNode != null && liveNode instanceof LiveObject
      )
      .map((liveNode): FlowNode => {
        const node = liveNode.toObject() as StorageNodeData;
        return {
          id: node.id,
          type: 'custom',
          position: node.position || { x: 0, y: 0 },
          data: node.data,
          draggable: true,
          connectable: true,
          selectable: true,
        };
      });
  });

  const edges = useStorage((root) => {
    return (root.edges ?? [])
      .filter((liveEdge): liveEdge is LiveObject<StorageEdgeData> => liveEdge != null)
      .map((liveEdge): Edge => {
        const edge = liveEdge.toObject();
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: edge.type || 'default',
          animated: true,
          markerEnd: defaultEdgeOptions.markerEnd,
          style: defaultEdgeOptions.style,
        };
      });
  });

  const updateNodes = useMutation(({ storage }, newFlowNodes: FlowNode[]) => {
    const liveListNodes = storage.get('nodes');
    liveListNodes.clear();
    newFlowNodes.forEach(flowNode => {
      const storageNodeData: StorageNodeData = {
        id: flowNode.id,
        type: flowNode.type || 'custom', // Ensure type consistency
        position: { x: flowNode.position.x, y: flowNode.position.y },
        data: flowNode.data, // This is NodeData
      };
      liveListNodes.push(new LiveObject(storageNodeData));
    });
  }, []);

  const updateEdges = useMutation(({ storage }, newFlowEdges: Edge[]) => {
    const liveListEdges = storage.get('edges');
    liveListEdges.clear();
    newFlowEdges.forEach(flowEdge => {
      const storageEdgeData: StorageEdgeData = {
        id: flowEdge.id,
        source: flowEdge.source,
        target: flowEdge.target,
        type: flowEdge.type || 'default',
      };
      liveListEdges.push(new LiveObject(storageEdgeData));
    });
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (isStorageLoading || !nodes) return;
      const updatedNodes = applyNodeChanges(changes, nodes) as FlowNode[];
      updateNodes(updatedNodes);
    },
    [nodes, updateNodes, isStorageLoading]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (isStorageLoading || !edges) return;
      const updatedEdges = applyEdgeChanges(changes, edges) as Edge[];
      updateEdges(updatedEdges);
    },
    [edges, updateEdges, isStorageLoading]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (isStorageLoading || !edges) return;
      const newEdge: Edge = {
        ...params,
        id: `edge-${Date.now()}`,
        type: 'default',
        animated: true,
        markerEnd: defaultEdgeOptions.markerEnd,
        style: defaultEdgeOptions.style,
      };
      // Add to local React Flow state first for immediate UI update, then persist all.
      const updatedEdgesForFlow = addEdge(newEdge, edges);
      updateEdges(updatedEdgesForFlow);
    },
    [edges, updateEdges, isStorageLoading]
  );

  const onAddNode = useCallback(() => {
    if (isStorageLoading || !nodes) return;
    const nodeCount = nodes.length;
    const newNode: FlowNode = {
      id: `node-${Date.now()}`,
      type: 'custom',
      position: { 
        x: 100 + (nodeCount % 5) * 250,
        y: 100 + Math.floor(nodeCount / 5) * 150 
      },
      draggable: true,
      connectable: true,
      selectable: true,
      data: {
        label: `Node ${nodeCount + 1}`,
        props: {
          title: `Node ${nodeCount + 1}`,
          description: 'Click to edit this node',
        },
      },
    };
    // Add to local React Flow state first for immediate UI update, then persist all.
    updateNodes([...nodes, newNode]);
  }, [nodes, updateNodes, isStorageLoading]);

  if (isStorageLoading && nodes === undefined) { // Check if nodes are still undefined from initial load
    return <div className="w-full h-full flex items-center justify-center">Loading Liveblocks Storage...</div>;
  }

  return (
    <div style={{ width: '100vw', height: '100vh' }} className="bg-gray-100">
       {isStorageLoading && nodes !== undefined && (
        <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(255,255,0,0.7)', padding: '5px', zIndex: 1000 }}>
          Syncing with Liveblocks...
        </div>
      )}
      <ReactFlow
        nodes={nodes || initialNodes}
        edges={edges || initialEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        minZoom={0.1}
        maxZoom={4}
        attributionPosition="bottom-right"
        deleteKeyCode={['Backspace', 'Delete']}
        nodesDraggable={!isStorageLoading} // Prevent interaction while not synced
        nodesConnectable={!isStorageLoading}
        elementsSelectable={!isStorageLoading}
      >
        <Background />
        <Controls />
        <Panel position="top-right" className="bg-white p-2 rounded shadow">
          <button
            onClick={onAddNode}
            className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors"
            disabled={isStorageLoading} // Disable button if not synced
          >
            Add Node
          </button>
        </Panel>
        <Panel position="top-left" className="bg-white p-2 rounded shadow">
          Nodes: {nodes?.length || 0}
        </Panel>
      </ReactFlow>
    </div>
  );
}

// Modify the main export default function to wrap CanvasContents with ReactFlowProvider
export default function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasContents />
    </ReactFlowProvider>
  );
} 