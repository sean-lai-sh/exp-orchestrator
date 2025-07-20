'use client';

import { useCallback, useState, useMemo, useRef, useEffect } from 'react';
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
import { motion, AnimatePresence } from 'framer-motion';

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
  const [isDeploying, setIsDeploying] = useState(false); // New state
  const [showDeployConfirm, setShowDeployConfirm] = useState(false); // New state
  const [deployAnimationActive, setDeployAnimationActive] = useState(false); // For progress bar/checkmark
  const [showCheckmark, setShowCheckmark] = useState(false); // Show checkmark after progress
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
  
  // Deploy handler
  const handleDeploy = useCallback(() => {
    setIsDeploying(true);
    setDeployAnimationActive(true);
    setShowCheckmark(false);
    const MIN_DURATION = 1500; // ms
    const start = Date.now();
    let deployFinished = false;
    let animationFinished = false;

    // When both deploy and animation are done, show checkmark
    function maybeFinish() {
      if (deployFinished && animationFinished) {
        setShowCheckmark(true);
        setTimeout(() => {
          setDeployAnimationActive(false);
          setIsDeploying(false);
          setShowDeployConfirm(false);
          setShowCheckmark(false);
        }, 1000); // Show checkmark for 1s
      }
    }

    // Animate progress bar using Framer Motion
    // (No need to manage progress state, just let motion.div animate width)
    // We'll use a key on the overlay to force remount/animate each deploy

    const payload = {
      nodes,
      edges,
    };
    fetch('/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        console.log('Deploy response:', data);
        // Optionally, show a toast or alert here
      })
      .catch((err) => {
        console.error('Deploy error:', err);
      })
      .finally(() => {
        deployFinished = true;
        maybeFinish();
      });

    // Animation timer for progress bar
    setTimeout(() => {
      animationFinished = true;
      maybeFinish();
    }, MIN_DURATION);
  }, [nodes, edges]);

  // Handler for Deploy button click (shows confirm modal)
  const handleDeployClick = useCallback(() => {
    setShowDeployConfirm(true);
  }, []);

  // Handler for confirming deploy in modal
  const handleConfirmDeploy = useCallback(() => {
    handleDeploy();
  }, [handleDeploy]);

  // Handler for cancelling deploy in modal
  const handleCancelDeploy = useCallback(() => {
    setShowDeployConfirm(false);
  }, []);

  return (
    <div ref={reactFlowWrapper} style={{ width: '100vw', height: '100vh' }} className="bg-gray-200 relative">
      {/* Progress bar/checkmark overlay */}
      <AnimatePresence>
      {deployAnimationActive && (
        <motion.div
          key="deploy-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm pointer-events-auto"
        >
          <div className="bg-white rounded-lg shadow-lg p-8 flex flex-col items-center min-w-[320px]">
            {!showCheckmark ? (
              <>
                <div className="text-lg font-semibold text-gray-700 mb-4">Deploying...</div>
                <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden mb-2">
                  <motion.div
                    key="progress-bar"
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 1.5, ease: 'linear' }}
                    className="h-full bg-blue-500"
                  />
                </div>
                <div className="text-xs text-gray-500">Please wait while we deploy your changes.</div>
              </>
            ) : (
              <>
                <motion.svg
                  key="checkmark"
                  className="h-16 w-16 text-green-500 mb-2"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                >
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
                  <path d="M7 13l3 3 7-7" stroke="currentColor" strokeWidth="2" fill="none" />
                </motion.svg>
                <div className="text-lg font-semibold text-green-600">Deployed!</div>
              </>
            )}
          </div>
        </motion.div>
      )}
      </AnimatePresence>
      {/* Deploy confirmation modal */}
      {showDeployConfirm && !isDeploying && !deployAnimationActive && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg p-8 flex flex-col items-center">
            <div className="text-lg font-semibold mb-4">Are you sure you want to deploy?</div>
            <div className="flex gap-4">
              <button
                className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition"
                onClick={handleConfirmDeploy}
              >
                Confirm
              </button>
              <button
                className="px-4 py-2 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
                onClick={handleCancelDeploy}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <div className={isDeploying || deployAnimationActive ? 'pointer-events-none blur-sm select-none' : ''} style={{ width: '100vw', height: '100vh' }}>
        <CanvasPanel 
          onAddNode={onAddNode}
          isSheetOpen={isLeftPanelOpen}
          setIsSheetOpen={setIsLeftPanelOpen}
          onDeploy={handleDeployClick} // Show confirm modal
          isDeploying={isDeploying || deployAnimationActive}
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