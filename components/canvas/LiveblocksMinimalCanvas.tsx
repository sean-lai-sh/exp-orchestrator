'use client';

import { useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Node,
  Edge,
  Connection,
  NodeChange,
  EdgeChange,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStorage, useMutation, useRoom } from '../../app/liveblocks.config';
import type { StorageNodeData, StorageEdgeData, NodeData } from '../../app/liveblocks.config';
import { LiveObject } from '@liveblocks/client';

type FlowNode = Node<NodeData>;

const initialNodes: FlowNode[] = [];
const initialEdges: Edge[] = [];

export default function LiveblocksMinimalCanvas() {
  const room = useRoom();
  const storageStatus = room.getStorageStatus();
  const isStorageLoading = storageStatus !== "synchronized";

  useEffect(() => {
    console.log("LiveblocksMinimalCanvas - Storage Status:", storageStatus);
  }, [storageStatus]);

  const nodes = useStorage((root) => {
    console.log("Reading nodes. Liveblocks root.nodes:", root.nodes);
    return root.nodes.map((liveNode): FlowNode => {
      const nodeData = liveNode.toObject();
      return {
        id: nodeData.id,
        type: nodeData.type || 'default',
        position: { x: nodeData.position.x, y: nodeData.position.y },
        data: { label: nodeData.data.label },
        draggable: true,
        selectable: true,
        connectable: true,
      };
    });
  });

  const edges = useStorage((root) => {
    console.log("Reading edges. Liveblocks root.edges:", root.edges);
    return root.edges.map((liveEdge): Edge => {
      const edgeData = liveEdge.toObject();
      return {
        id: edgeData.id,
        source: edgeData.source,
        target: edgeData.target,
        type: edgeData.type || 'default',
      };
    });
  });

  const addNodeToStorage = useMutation(({ storage }, newNodeData: StorageNodeData) => {
    console.log("addNodeToStorage: Adding to LiveList:", newNodeData);
    try {
      storage.get('nodes').push(new LiveObject(newNodeData));
      console.log("addNodeToStorage: SUCCEEDED");
    } catch (error) {
      console.error("addNodeToStorage: FAILED", error);
    }
  }, []);

  const updateNodesInStorage = useMutation(({ storage }, newNodesData: StorageNodeData[]) => {
    console.log("updateNodesInStorage: Replacing LiveList content with:", newNodesData);
    console.log("Reading nodes from Liveblocks storage. Root:", root);
    const storedNodes = root.nodes ?? [];
    const mappedNodes = storedNodes.map((storedNode: StorageNode): FlowNode => ({
      id: storedNode.id,
      type: storedNode.type || 'default',
      position: { x: storedNode.position.x, y: storedNode.position.y },
      data: { label: storedNode.data.label },
      draggable: true,
      selectable: true,
      connectable: true,
    }));
    console.log("Mapped FlowNodes:", mappedNodes);
    return mappedNodes;
  });

  const edges = useStorage((root) => {
    console.log("Reading edges from Liveblocks storage. Root:", root);
    const storedEdges = root.edges ?? [];
    const mappedEdges = storedEdges.map((storedEdge: StorageEdge): Edge => ({
      id: storedEdge.id,
      source: storedEdge.source,
      target: storedEdge.target,
      type: storedEdge.type || 'default',
    }));
    console.log("Mapped FlowEdges:", mappedEdges);
    return mappedEdges;
  });

  const updateNodes = useMutation(({ storage }, newFlowNodes: FlowNode[]) => {
    console.log("updateNodes mutation: Preparing to save FlowNodes:", newFlowNodes);
    const newStorageNodes: StorageNode[] = newFlowNodes.map(flowNode => ({
      id: flowNode.id,
      type: flowNode.type || 'default',
      position: { x: flowNode.position.x, y: flowNode.position.y },
      data: { label: flowNode.data.label },
    }));
    console.log("updateNodes mutation: Saving StorageNodes:", newStorageNodes);
    try {
      storage.set('nodes', newStorageNodes);
      console.log("updateNodes mutation: storage.set('nodes') SUCCEEDED.");
    } catch (error) {
      console.error("updateNodes mutation: storage.set('nodes') FAILED:", error);
    }
  }, []);

  const updateEdges = useMutation(({ storage }, newFlowEdges: Edge[]) => {
    console.log("updateEdges mutation: Saving Edges:", newFlowEdges);
    const newStorageEdges: StorageEdge[] = newFlowEdges.map(flowEdge => ({
      id: flowEdge.id,
      source: flowEdge.source,
      target: flowEdge.target,
      type: flowEdge.type || 'default',
    }));
    try {
      storage.set('edges', newStorageEdges);
      console.log("updateEdges mutation: storage.set('edges') SUCCEEDED.");
    } catch (error) {
      console.error("updateEdges mutation: storage.set('edges') FAILED:", error);
    }
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (isStorageLoading || !nodes) {
        console.log("onNodesChange: Skipped due to loading or no nodes.");
        return;
      }
      console.log("onNodesChange: Applying changes:", changes);
      const updatedNodes = applyNodeChanges(changes, nodes) as FlowNode[];
      updateNodes(updatedNodes);
    },
    [nodes, updateNodes, isStorageLoading]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (isStorageLoading || !edges) {
        console.log("onEdgesChange: Skipped due to loading or no edges.");
        return;
      }
      console.log("onEdgesChange: Applying changes:", changes);
      const updatedEdges = applyEdgeChanges(changes, edges) as Edge[];
      updateEdges(updatedEdges);
    },
    [edges, updateEdges, isStorageLoading]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (isStorageLoading || !edges) {
        console.log("onConnect: Skipped due to loading or no edges.");
        return;
      }
      console.log("onConnect: Creating new edge from connection:", connection);
      const newEdgeList = addEdge(connection, edges);
      updateEdges(newEdgeList);
    },
    [edges, updateEdges, isStorageLoading]
  );

  const onAddNode = useCallback(() => {
    if (isStorageLoading || !nodes) {
        console.log("onAddNode: Skipped due to loading or no nodes.");
        return;
    }
    const newNodeId = `node-${Date.now()}`;
    console.log("onAddNode: Adding new node with ID:", newNodeId);
    const newNode: FlowNode = {
      id: newNodeId,
      type: 'default',
      data: { 
        label: `Node ${newNodeId}`
      }, 
      position: {
        x: 100 + (nodes.length % 8) * 100, 
        y: 100 + Math.floor(nodes.length / 8) * 100,
      },
      draggable: true,
      selectable: true,
      connectable: true,
    };
    updateNodes([...nodes, newNode]);
  }, [nodes, updateNodes, isStorageLoading]);
  
  if (isStorageLoading && nodes === undefined) {
    console.log("Displaying full loading screen because nodes are undefined and storage is loading.");
    return <div className="w-full h-full flex items-center justify-center">Loading Liveblocks Storage... (Nodes Undefined)</div>;
  }

  return (
    <div style={{ width: '100vw', height: '100vh' }} className="bg-gray-200">
      {isStorageLoading && nodes !== undefined && (
        <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(255,255,0,0.7)', padding: '5px', zIndex: 100 }}>
          Syncing with Liveblocks...
        </div>
      )}
      <ReactFlow
        nodes={nodes || initialNodes} 
        edges={edges || initialEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={!isStorageLoading}
        nodesConnectable={!isStorageLoading}
        elementsSelectable={!isStorageLoading}
      >
        <Controls />
        <Background />
        <Panel position="top-right">
          <button
            onClick={onAddNode}
            className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors m-2"
            disabled={isStorageLoading}
          >
            Add Live Node (Simple)
          </button>
        </Panel>
      </ReactFlow>
    </div>
  );
} 