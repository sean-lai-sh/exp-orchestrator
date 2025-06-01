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
import CustomEditableNode from './CustomEditableNode';
import type { EditableNodeData } from '../../lib/types';
import { AnimatedSVGEdge } from './AnimatedSVGEdge';
import ComponentPanel from '../ui/ComponentPanel';

// Update initialNodes to use the custom type and data structure
const initialNodes: Node<EditableNodeData>[] = [
  { 
    id: '1', 
    type: 'customEditable', // Use the new custom type
    data: { 
      name: 'Editable Node 1',
      description: '',
      token: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `token-initial-1`,
      access_types: {
        // canSend and canReceive will default to true in the component if undefined here
        allowedSendTypes: [],
        allowedReceiveTypes: []
      }
    }, 
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
  const [selectedNodeForPanel, setSelectedNodeForPanel] = useState<Node<EditableNodeData> | null>(null);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true); // Controls both panels
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
      setEdges((eds) => addEdge({ ...connection, type: 'animated', animated: true, reconnectable: true }, eds)),
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
      data: { 
        name: `Node ${newNodeId}`,
        description: '',
        token: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `token-${Date.now()}`,
        access_types: {
          // canSend and canReceive will default to true in the component if undefined here
          allowedSendTypes: [],
          allowedReceiveTypes: []
        }
      },
      position: newPosition,
      draggable: true,
      selectable: true,
      connectable: true,
    };
    setNodes((nds) => nds.concat(newNode));
  }, [reactFlowInstance, setNodes]);

  const onPaneClick = useCallback(() => {
    setSelectedNodeForPanel(null);
    // Optionally, you might want to close the panel as well if no node is selected
    // if (!isLeftPanelOpen) setIsLeftPanelOpen(false); // Example, if you want panel to close
  }, [setSelectedNodeForPanel]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node<EditableNodeData>) => {
    console.log("onNodeClick triggered. Node:", node);
    setSelectedNodeForPanel(node);
    // Panel opens if isLeftPanelOpen is true, showing the selected node
  }, []);

  const handleNodeDataChange = useCallback((nodeId: string, newData: Partial<EditableNodeData>) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          // Ensure data is always defined and new properties are merged correctly
          const currentData = node.data || { title: '', description: '' }; 
          const updatedData = { ...currentData, ...newData };
          return { ...node, data: updatedData as EditableNodeData };
        }
        return node;
      })
    );
    // If the currently selected node in the panel is the one being updated,
    // refresh its data in the panel as well to show immediate feedback.
    setSelectedNodeForPanel(prevNode => 
      prevNode && prevNode.id === nodeId ? { ...prevNode, data: { ...prevNode.data, ...newData } as EditableNodeData } : prevNode
    );
  }, [setNodes]);

  const handleComponentPanelClearSelection = useCallback(() => {
    setSelectedNodeForPanel(null);
  }, []);

  const nodeTypes = useMemo(() => ({
    customEditable: (props: any) => { 
      return <CustomEditableNode {...props} setNodes={setNodes} />;
    }
  }), [setNodes]);
  
  return (
    <div ref={reactFlowWrapper} style={{ width: '100vw', height: '100vh' }} className="bg-gray-200 relative">
      <CanvasPanel 
        onAddNode={onAddNode}
        isSheetOpen={isLeftPanelOpen}
        setIsSheetOpen={setIsLeftPanelOpen}
      />
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
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
      >
        <Controls />
        <Background />
        <MiniMap />
      </ReactFlow>
      <ComponentPanel 
        selectedNode={selectedNodeForPanel}
        onNodeDataChange={handleNodeDataChange}
        isOpen={isLeftPanelOpen}
        onClearSelection={handleComponentPanelClearSelection}
      />
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