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
import { Trash2, Copy, Plus } from 'lucide-react';

// Import the new CanvasPanel
import CanvasPanel from '../ui/CanvasPanel';

// Import context menu components
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../ui/context-menu';

// Import the custom node and its data type
import SenderNode from '../nodes/SenderNode';
import ReceiverNode from '../nodes/ReceiverNode';
import PluginNode from '../nodes/PluginNode';
import type { NodeType, EditableNodeData, NodeTemplate, SenderNodeData, ReceiverNodeData, PluginNodeData } from '../../lib/types';
import { AnimatedSVGEdge } from './AnimatedSVGEdge';
import ComponentPanel from '../ui/ComponentPanel';

// Helper to generate default node data for each type
function getDefaultNodeData(type: NodeType, id: string, template?: NodeTemplate): EditableNodeData {
  const baseToken = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `token-${Date.now()}`;
  if (template) {
    // Merge template data with required fields
    const templateData = {
      ...template.defaultData,
      token: baseToken,
      name: template.defaultData.name || `${type.charAt(0).toUpperCase() + type.slice(1)} Node`
    };
    return templateData as EditableNodeData;
  }
  // Default fallback for non-template nodes
  const base = {
    name: `${type.charAt(0).toUpperCase() + type.slice(1)} Node`,
    description: '',
    token: baseToken,
    nodeType: type,
    access_types: {
      allowedSendTypes: [],
      allowedReceiveTypes: [],
    },
  };
  if (type === 'sender') {
    return { 
      ...base, 
      nodeType: 'sender' as const,
      sources: [],
      access_types: { ...base.access_types, canSend: true, canReceive: false } 
    } as SenderNodeData;
  }
  if (type === 'receiver') {
    return { 
      ...base, 
      nodeType: 'receiver' as const,
      sources: [],
      access_types: { ...base.access_types, canSend: false, canReceive: true } 
    } as ReceiverNodeData;
  }
  // plugin
  return { 
    ...base, 
    nodeType: 'plugin' as const,
    access_types: { ...base.access_types, canSend: true, canReceive: true } 
  } as PluginNodeData;
}

// Update initialNodes to use the new system (default to plugin)
const initialNodes: Node<EditableNodeData>[] = [
  {
    id: '1',
    type: 'plugin',
    data: getDefaultNodeData('plugin', '1'),
    position: { x: 250, y: 5 },
    draggable: true,
    selectable: true,
    connectable: true,
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
  const [contextMenuNode, setContextMenuNode] = useState<Node<EditableNodeData> | null>(null);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true); // Controls both panels
  const [isDeploying, setIsDeploying] = useState(false); // New state
  const [showDeployConfirm, setShowDeployConfirm] = useState(false); // New state
  const [deployAnimationActive, setDeployAnimationActive] = useState(false); // For progress bar/checkmark
  const [showCheckmark, setShowCheckmark] = useState(false); // Show checkmark after progress
  const [isCleaning, setIsCleaning] = useState(false); // New state for cleaning
  const [showCleanConfirm, setShowCleanConfirm] = useState(false); // New state for clean confirm
  const edgeReconnectSuccessful = useRef(true);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useReactFlow();

  // Register node types with setNodes injection (must be after setNodes is defined)
  const nodeTypes = useMemo(() => ({
    sender: (props: any) => <SenderNode {...props} setNodes={setNodes} />,
    receiver: (props: any) => <ReceiverNode {...props} setNodes={setNodes} />,
    plugin: (props: any) => <PluginNode {...props} setNodes={setNodes} />,
  }), [setNodes]);

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
    (connection: Connection) => {
      // Get the source handle ID and derive color from source handle
      const sourceHandleId = connection.sourceHandle || 'default';
      
      // Find the source node to get its sources array for color consistency
      const sourceNode = nodes.find(node => node.id === connection.source);
      let edgeColor = '#3b82f6'; // default blue
      
      if (sourceNode && sourceNode.data.sources && sourceHandleId !== 'default') {
        // Find the index of this source to match handle color
        const sourceIndex = sourceNode.data.sources.findIndex((src: string) => src === sourceHandleId);
        if (sourceIndex !== -1) {
          // Use the same color scheme as handles
          const sourceColors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16', '#ec4899', '#6366f1', '#14b8a6'];
          edgeColor = sourceColors[sourceIndex % sourceColors.length];
        }
      }
      
      setEdges((eds) => addEdge({ 
        ...connection, 
        type: 'animated', 
        animated: true, 
        reconnectable: true,
        style: { stroke: edgeColor, strokeWidth: 2 },
        data: { color: edgeColor, sourceHandle: sourceHandleId }
      }, eds));
    },
    [setEdges, nodes]
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

  const onAddNode = useCallback((type: NodeType = 'plugin', template?: NodeTemplate) => {
    // Use a random hash/UUID for node ID
    let newNodeId: string;
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      newNodeId = crypto.randomUUID();
    } else {
      // Fallback: random base36 string
      newNodeId = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    }
    let newPosition = { x: Math.random() * 200 + 50, y: Math.random() * 200 + 50 };
    if (reactFlowWrapper.current) {
      const { width, height } = reactFlowWrapper.current.getBoundingClientRect();
      const targetX = width / 2;
      const targetY = height / 2;
      newPosition = reactFlowInstance.screenToFlowPosition({ x: targetX, y: targetY });
    }
    const newNode: Node<EditableNodeData> = {
      id: newNodeId,
      type: type,
      data: getDefaultNodeData(type, newNodeId, template),
      position: newPosition,
      draggable: true,
      selectable: true,
      connectable: true,
    };
    setNodes((nds) => nds.concat(newNode));
  }, [reactFlowInstance, setNodes]);

  const onPaneClick = useCallback(() => {
    setSelectedNodeForPanel(null);
    setContextMenuNode(null);
    // Optionally, you might want to close the panel as well if no node is selected
    // if (!isLeftPanelOpen) setIsLeftPanelOpen(false); // Example, if you want panel to close
  }, [setSelectedNodeForPanel]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node<EditableNodeData>) => {
    console.log("onNodeClick triggered. Node:", node);
    setSelectedNodeForPanel(node);
    // Panel opens if isLeftPanelOpen is true, showing the selected node
  }, []);

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node<EditableNodeData>) => {
    event.preventDefault();
    setContextMenuNode(node);
  }, []);

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    
    // Clear selection if the deleted node was selected
    if (selectedNodeForPanel?.id === nodeId) {
      setSelectedNodeForPanel(null);
    }
    if (contextMenuNode?.id === nodeId) {
      setContextMenuNode(null);
    }
  }, [selectedNodeForPanel, contextMenuNode]);

  const handleDuplicateNode = useCallback((nodeId: string) => {
    const nodeToDuplicate = nodes.find(node => node.id === nodeId);
    if (!nodeToDuplicate) return;

    const newNodeId = `${nextNodeId++}`;
    const newNode: Node<EditableNodeData> = {
      ...nodeToDuplicate,
      id: newNodeId,
      position: {
        x: nodeToDuplicate.position.x + 50,
        y: nodeToDuplicate.position.y + 50,
      },
      data: {
        ...nodeToDuplicate.data,
        name: `${nodeToDuplicate.data.name} (Copy)`,
        token: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `token-${Date.now()}`,
      }
    };
    setNodes((nds) => nds.concat(newNode));
    setContextMenuNode(null);
  }, [nodes]);

  // Remove keyboard delete support since we're only using right-click now

  const handleCleanWorkflow = useCallback(() => {
    setIsCleaning(true);
    setShowCheckmark(false);
    
    setTimeout(() => {
      const HORIZONTAL_SPACING = 400;
      const VERTICAL_SPACING = 200;
      const START_X = 150;
      const START_Y = 150;

      // Build connection maps
      const nodeMap = new Map(nodes.map(n => [n.id, n]));
      const outgoingMap = new Map<string, Edge[]>();
      const incomingMap = new Map<string, Edge[]>();
      
      edges.forEach(edge => {
        if (!outgoingMap.has(edge.source)) outgoingMap.set(edge.source, []);
        if (!incomingMap.has(edge.target)) incomingMap.set(edge.target, []);
        outgoingMap.get(edge.source)!.push(edge);
        incomingMap.get(edge.target)!.push(edge);
      });

      // Calculate depth levels for visual hierarchy
      function calculateDepth(nodeId: string, visited = new Set<string>()): number {
        if (visited.has(nodeId)) return 0; // cycle protection
        visited.add(nodeId);
        
        const incoming = incomingMap.get(nodeId) || [];
        if (incoming.length === 0) return 0; // root node
        
        return 1 + Math.max(...incoming.map(edge => calculateDepth(edge.source, new Set(visited))));
      }

      // Group nodes by depth level and type preference
      const nodesByDepth = new Map<number, { senders: Node<EditableNodeData>[], plugins: Node<EditableNodeData>[], receivers: Node<EditableNodeData>[] }>();
      
      nodes.forEach(node => {
        const depth = calculateDepth(node.id);
        if (!nodesByDepth.has(depth)) {
          nodesByDepth.set(depth, { senders: [], plugins: [], receivers: [] });
        }
        
        const level = nodesByDepth.get(depth)!;
        if (node.type === 'sender') level.senders.push(node);
        else if (node.type === 'plugin') level.plugins.push(node);
        else if (node.type === 'receiver') level.receivers.push(node);
      });

      // Position nodes with visual hierarchy rules:
      // 1. Senders typically at depth 0 (leftmost)
      // 2. Plugins in middle depths
      // 3. Receivers typically at higher depths (rightmost)
      const nodePositions: Record<string, {x: number, y: number}> = {};
      const sortedDepths = Array.from(nodesByDepth.keys()).sort((a, b) => a - b);
      
      sortedDepths.forEach((depth, depthIdx) => {
        const level = nodesByDepth.get(depth)!;
        const xOffset = START_X + (depthIdx * HORIZONTAL_SPACING);
        let yOffset = START_Y;
        
        // Within each depth level, order by type: senders, plugins, receivers
        const orderedNodes = [...level.senders, ...level.plugins, ...level.receivers];
        
        orderedNodes.forEach((node, nodeIdx) => {
          nodePositions[node.id] = {
            x: xOffset,
            y: yOffset + (nodeIdx * VERTICAL_SPACING)
          };
        });
      });

      // Handle edge case: nodes with no connections (completely isolated)
      const connectedNodeIds = new Set([
        ...edges.map(e => e.source),
        ...edges.map(e => e.target)
      ]);
      
      const isolatedNodes = nodes.filter(n => !connectedNodeIds.has(n.id));
      if (isolatedNodes.length > 0) {
        const isolatedStartX = START_X + ((sortedDepths.length + 2) * HORIZONTAL_SPACING);
        isolatedNodes.forEach((node, idx) => {
          nodePositions[node.id] = {
            x: isolatedStartX + (node.type === 'sender' ? 0 : node.type === 'plugin' ? HORIZONTAL_SPACING : HORIZONTAL_SPACING * 2),
            y: START_Y + (idx * VERTICAL_SPACING)
          };
        });
      }

      const cleanedNodes = nodes.map(node => ({
        ...node,
        position: nodePositions[node.id] || node.position
      }));
      
      setNodes(cleanedNodes);
      setIsCleaning(false);
      setShowCheckmark(true);
      setTimeout(() => setShowCheckmark(false), 2000);
    }, 2000);
  }, [nodes, edges, setNodes]);

  const handleCleanClick = useCallback(() => {
    setShowCleanConfirm(true);
  }, []);

  const handleConfirmClean = useCallback(() => {
    setShowCleanConfirm(false);
    handleCleanWorkflow();
  }, [handleCleanWorkflow]);

  const handleCancelClean = useCallback(() => {
    setShowCleanConfirm(false);
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
      
      {/* Clean workflow confirmation modal */}
      {showCleanConfirm && !isCleaning && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg p-8 flex flex-col items-center">
            <div className="text-lg font-semibold mb-2">Clean & Organize Workflow</div>
            <div className="text-sm text-gray-600 mb-4 text-center">
              This will organize your workflow into clean horizontal chains<br />
              based on data flow connections and logical groupings.
            </div>
            <div className="flex gap-4">
              <button
                className="px-4 py-2 rounded bg-purple-600 text-white hover:bg-purple-700 transition"
                onClick={handleConfirmClean}
              >
                Clean Workflow
              </button>
              <button
                className="px-4 py-2 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
                onClick={handleCancelClean}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className={isDeploying || deployAnimationActive || isCleaning ? 'pointer-events-none blur-sm select-none' : ''} style={{ width: '100vw', height: '100vh' }}>
        <CanvasPanel 
          onAddNode={onAddNode}
          isSheetOpen={isLeftPanelOpen}
          setIsSheetOpen={setIsLeftPanelOpen}
          onDeploy={handleDeployClick} // Show confirm modal
          isDeploying={isDeploying || deployAnimationActive}
          onCleanWorkflow={handleCleanClick}
          isCleaning={isCleaning}
        />
        <ContextMenu onOpenChange={(open) => !open && setContextMenuNode(null)}>
          <ContextMenuTrigger asChild>
            <div style={{ width: '100%', height: '100%' }}>
              <ReactFlow
                nodes={nodes.map(node => ({
                  ...node,
                  style: {
                    ...node.style,
                    outline: contextMenuNode?.id === node.id ? '2px solid #ef4444' : 'none',
                    boxShadow: contextMenuNode?.id === node.id ? '0 0 0 2px rgba(239, 68, 68, 0.2)' : 'none'
                  }
                }))}
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
                onNodeContextMenu={onNodeContextMenu}
                onPaneClick={onPaneClick}
              >
                <Controls />
                <Background />
                <MiniMap />
              </ReactFlow>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            {contextMenuNode ? (
              <>
                <ContextMenuItem
                  onClick={() => handleDuplicateNode(contextMenuNode.id)}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate Node
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  className="text-red-600 focus:text-red-600 focus:bg-red-50"
                  onClick={() => handleDeleteNode(contextMenuNode.id)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Node
                </ContextMenuItem>
              </>
            ) : (
              <>
                <ContextMenuItem
                  onClick={() => onAddNode('sender')}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Sender Node
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => onAddNode('receiver')}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Receiver Node
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => onAddNode('plugin')}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Plugin Node
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        </ContextMenu>
        <ComponentPanel 
          selectedNode={selectedNodeForPanel}
          onNodeDataChange={handleNodeDataChange}
          isOpen={!!selectedNodeForPanel}
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