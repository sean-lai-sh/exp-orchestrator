'use client';

import { useCallback, useState, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  reconnectEdge,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  MiniMap,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// Import the new CanvasPanel
import CanvasPanel from '../ui/CanvasPanel';

// Import the custom node and its data type
import CustomEditableNode, { type EditableNodeData } from './CustomEditableNode';
import { AnimatedSVGEdge } from './AnimatedSVGEdge';

// Update initialNodes to use the custom type and data structure
const initialNodes: Node<EditableNodeData>[] = [
  { 
    id: '1', 
    type: 'customEditable', // Use the new custom type
    data: { title: 'Editable Node 1', description: 'Start here!' }, 
    position: { x: 250, y: 5 }, 
    draggable: true, 
    selectable: true, 
    connectable: true 
  },
];

let nextNodeId = 2;
const initialEdges: Edge[] = [];

// Define edgeTypes to use the custom animated edge
const edgeTypes = {
  animated: AnimatedSVGEdge,
};

// Define a new sub-component that will contain the main flow logic
function FlowContent() {
  const [nodes, setNodes] = useState<Node<EditableNodeData>[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const edgeReconnectSuccessful = useRef(true);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useReactFlow();

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => 
      setNodes((nds) => applyNodeChanges(changes, nds) as Node<EditableNodeData>[]),
    [setNodes]
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges]
  );
  const onConnect = useCallback(
    (connection: Connection) => 
      setEdges((eds) => addEdge({ ...connection, type: 'animated', animated: true }, eds)),
    [setEdges]
  );

  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
  }, []);

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      edgeReconnectSuccessful.current = true;
      setEdges((els) => reconnectEdge(oldEdge, newConnection, els));
    },
    [setEdges]
  );

  const onReconnectEnd = useCallback(
    (_: globalThis.MouseEvent | globalThis.TouchEvent, edge: Edge) => {
      if (!edgeReconnectSuccessful.current) {
        setEdges((eds) => eds.filter((e) => e.id !== edge.id));
      }
      edgeReconnectSuccessful.current = true;
    },
    [setEdges]
  );

  const onAddNode = useCallback(() => {
    const newNodeId = `${nextNodeId++}`;
    let newPosition = { x: Math.random() * 200 + 50, y: Math.random() * 200 + 50 }; // Default random position

    if (reactFlowWrapper.current) {
      const { width, height } = reactFlowWrapper.current.getBoundingClientRect();
      const targetX = width / 2;
      const targetY = height / 2;
      newPosition = reactFlowInstance.screenToFlowPosition({ x: targetX, y: targetY });
    }
    console.log("Adding node at position:", newPosition);

    const newNode: Node<EditableNodeData> = {
      id: newNodeId,
      type: 'customEditable',
      data: { title: `Node ${newNodeId}`, description: 'Edit me!' },
      position: newPosition,
      draggable: true,
      selectable: true,
      connectable: true,
    };
    setNodes((nds) => nds.concat(newNode));
  }, [reactFlowInstance, setNodes]);

  const nodeTypes = useMemo(() => ({
    customEditable: (props: any) => { 
      return <CustomEditableNode {...props} setNodes={setNodes} />;
    }
  }), [setNodes]);
  
  return (
    <div ref={reactFlowWrapper} style={{ width: '100vw', height: '100vh' }} className="bg-gray-200 relative">
      <CanvasPanel onAddNode={onAddNode} />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onReconnect={onReconnect}
        onReconnectStart={onReconnectStart}
        onReconnectEnd={onReconnectEnd}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
      >
        <Controls />
        <Background />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}

// The main export now wraps FlowContent with ReactFlowProvider
export default function MinimalCanvas() {
  return (
    <ReactFlowProvider>
      <FlowContent />
    </ReactFlowProvider>
  );
} 