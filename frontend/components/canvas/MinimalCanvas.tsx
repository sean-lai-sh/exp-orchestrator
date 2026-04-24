'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  reconnectEdge,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Copy, Plus, Trash2 } from 'lucide-react';
import CanvasPanel from '../ui/CanvasPanel';
import AnalyzerPanel from '../ui/AnalyzerPanel';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../ui/context-menu';
import SenderNode from '../nodes/SenderNode';
import ReceiverNode from '../nodes/ReceiverNode';
import PluginNode from '../nodes/PluginNode';
import ComponentPanel from '../ui/ComponentPanel';
import type {
  EditableNodeData,
  NodeTemplate,
  NodeType,
  PluginNodeData,
  ReceiverNodeData,
  SenderNodeData,
} from '../../lib/types';
import { AnimatedSVGEdge } from './AnimatedSVGEdge';
import { analyzeDAG, type AnalysisResult, type AnalyzerIssue } from '../../lib/dag-analyzer';
import { getEdgeStreamType, getNodeOutputTypes } from '../../lib/workflow-validation';

function getDefaultNodeData(type: NodeType, template?: NodeTemplate): EditableNodeData {
  const baseToken = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `token-${Date.now()}`;

  if (template) {
    return {
      token: baseToken,
      name: template.defaultData.name || `${type[0].toUpperCase()}${type.slice(1)} Node`,
      description: '',
      nodeType: type,
      access_types: {
        canSend: type !== 'receiver',
        canReceive: type !== 'sender',
        allowedSendTypes: [],
        allowedReceiveTypes: [],
      },
      runtime: type === 'plugin' ? '' : undefined,
      ...template.defaultData,
    } as EditableNodeData;
  }

  const base = {
    name: `${type[0].toUpperCase()}${type.slice(1)} Node`,
    description: '',
    token: baseToken,
    nodeType: type,
    runtime: type === 'plugin' ? '' : undefined,
    access_types: {
      allowedSendTypes: [],
      allowedReceiveTypes: [],
      canSend: type !== 'receiver',
      canReceive: type !== 'sender',
    },
  };

  if (type === 'sender') {
    return {
      ...base,
      nodeType: 'sender',
      sources: ['json'],
    } as SenderNodeData;
  }

  if (type === 'receiver') {
    return {
      ...base,
      nodeType: 'receiver',
      sources: [],
    } as ReceiverNodeData;
  }

  return {
    ...base,
    nodeType: 'plugin',
    sources: ['json'],
  } as PluginNodeData;
}

const initialNodes: Node<EditableNodeData>[] = [
  {
    id: '1',
    type: 'plugin',
    data: getDefaultNodeData('plugin'),
    position: { x: 250, y: 5 },
  },
];

const edgeTypes = {
  animated: AnimatedSVGEdge,
};

function FlowContent() {
  const [nodes, setNodes] = useState<Node<EditableNodeData>[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeForPanel, setSelectedNodeForPanel] = useState<Node<EditableNodeData> | null>(null);
  const [contextMenuNode, setContextMenuNode] = useState<Node<EditableNodeData> | null>(null);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isDeploying, setIsDeploying] = useState(false);
  const [showDeployConfirm, setShowDeployConfirm] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [showCleanConfirm, setShowCleanConfirm] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(() => analyzeDAG(initialNodes, []));
  const [isValidatingBackend, setIsValidatingBackend] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [focusedIssue, setFocusedIssue] = useState<AnalyzerIssue | null>(null);

  const edgeReconnectSuccessful = useRef(true);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useReactFlow();

  const nodeTypes = useMemo(() => ({
    sender: (props: any) => <SenderNode {...props} setNodes={setNodes} />,
    receiver: (props: any) => <ReceiverNode {...props} setNodes={setNodes} />,
    plugin: (props: any) => <PluginNode {...props} setNodes={setNodes} />,
  }), []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAnalysisResult(analyzeDAG(nodes, edges));
    }, 300);

    return () => window.clearTimeout(timer);
  }, [nodes, edges]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((currentNodes) => applyNodeChanges(changes, currentNodes) as Node<EditableNodeData>[]);
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((currentEdges) => applyEdgeChanges(changes, currentEdges));
  }, []);

  const onAddNode = useCallback((type: NodeType = 'plugin', template?: NodeTemplate, explicitPosition?: { x: number; y: number }) => {
    const nodeId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);

    let position = explicitPosition ?? { x: Math.random() * 200 + 75, y: Math.random() * 200 + 75 };
    if (!explicitPosition && reactFlowWrapper.current) {
      const { width, height } = reactFlowWrapper.current.getBoundingClientRect();
      position = reactFlowInstance.screenToFlowPosition({ x: width / 2, y: height / 2 });
    }

    const newNode: Node<EditableNodeData> = {
      id: nodeId,
      type,
      data: getDefaultNodeData(type, template),
      position,
      draggable: true,
      selectable: true,
      connectable: true,
    };

    setNodes((currentNodes) => currentNodes.concat(newNode));
    setSelectedNodeForPanel(newNode);
  }, [reactFlowInstance]);

  const onConnect = useCallback((connection: Connection) => {
    const sourceHandleId = connection.sourceHandle || 'default';
    const sourceNode = nodes.find((node) => node.id === connection.source);
    const sourceOutputs = sourceNode ? getNodeOutputTypes(sourceNode) : [];
    const streamType = sourceOutputs[0] || 'json';

    let edgeColor = '#00d4ff';
    if (sourceNode?.data.sources && sourceHandleId !== 'default') {
      const sourceIndex = sourceNode.data.sources.findIndex((source: string) => source === sourceHandleId);
      const palette = ['#00d4ff', '#34d399', '#a78bfa', '#fbbf24', '#f87171', '#38bdf8', '#a3e635', '#f472b6'];
      if (sourceIndex >= 0) {
        edgeColor = palette[sourceIndex % palette.length];
      }
    }

    setEdges((currentEdges) => addEdge({
      ...connection,
      type: 'animated',
      animated: true,
      reconnectable: true,
      style: { stroke: edgeColor, strokeWidth: 2 },
      data: {
        color: edgeColor,
        sourceHandle: sourceHandleId,
        streamType,
        label: streamType,
      },
    }, currentEdges));
  }, [nodes]);

  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
  }, []);

  const onReconnect = useCallback((oldEdge: Edge, newConnection: Connection) => {
    edgeReconnectSuccessful.current = true;
    setEdges((currentEdges) => reconnectEdge(oldEdge, newConnection, currentEdges));
  }, []);

  const onReconnectEnd = useCallback((_: MouseEvent | TouchEvent, edge: Edge) => {
    if (!edgeReconnectSuccessful.current) {
      setEdges((currentEdges) => currentEdges.filter((candidate) => candidate.id !== edge.id));
    }
    edgeReconnectSuccessful.current = true;
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/reactflow-type') as NodeType;
    if (!type) {
      return;
    }

    const templateString = event.dataTransfer.getData('application/reactflow-template');
    const template = templateString ? JSON.parse(templateString) as NodeTemplate : undefined;
    const position = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    onAddNode(type, template, position);
  }, [onAddNode, reactFlowInstance]);

  const onPaneClick = useCallback(() => {
    setSelectedNodeForPanel(null);
    setContextMenuNode(null);
    setFocusedIssue(null);
  }, []);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node<EditableNodeData>) => {
    setSelectedNodeForPanel(node);
    setContextMenuNode(null);
  }, []);

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node<EditableNodeData>) => {
    event.preventDefault();
    setContextMenuNode(node);
  }, []);

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((currentNodes) => currentNodes.filter((node) => node.id !== nodeId));
    setEdges((currentEdges) => currentEdges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    if (selectedNodeForPanel?.id === nodeId) {
      setSelectedNodeForPanel(null);
    }
    if (contextMenuNode?.id === nodeId) {
      setContextMenuNode(null);
    }
  }, [contextMenuNode, selectedNodeForPanel]);

  const handleDuplicateNode = useCallback((nodeId: string) => {
    const nodeToDuplicate = nodes.find((node) => node.id === nodeId);
    if (!nodeToDuplicate) {
      return;
    }

    const duplicateId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);
    const duplicatedNode: Node<EditableNodeData> = {
      ...nodeToDuplicate,
      id: duplicateId,
      position: {
        x: nodeToDuplicate.position.x + 60,
        y: nodeToDuplicate.position.y + 60,
      },
      data: {
        ...nodeToDuplicate.data,
        token: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `token-${Date.now()}`,
        name: `${nodeToDuplicate.data.name} (Copy)`,
      },
    };

    setNodes((currentNodes) => currentNodes.concat(duplicatedNode));
    setSelectedNodeForPanel(duplicatedNode);
    setContextMenuNode(null);
  }, [nodes]);

  const handleNodeDataChange = useCallback((nodeId: string, newData: Partial<EditableNodeData>) => {
    setNodes((currentNodes) => currentNodes.map((node) => {
      if (node.id !== nodeId) {
        return node;
      }
      const updatedNode = { ...node, data: { ...node.data, ...newData } as EditableNodeData };
      return updatedNode;
    }));

    setSelectedNodeForPanel((currentSelected) => (
      currentSelected && currentSelected.id === nodeId
        ? { ...currentSelected, data: { ...currentSelected.data, ...newData } as EditableNodeData }
        : currentSelected
    ));
  }, []);

  const handleComponentPanelClearSelection = useCallback(() => {
    setSelectedNodeForPanel(null);
  }, []);

  const handleCleanWorkflow = useCallback(() => {
    setIsCleaning(true);

    window.setTimeout(() => {
      const HORIZONTAL_SPACING = 360;
      const VERTICAL_SPACING = 180;
      const START_X = 150;
      const START_Y = 120;

      const incomingMap = new Map<string, Edge[]>();
      edges.forEach((edge) => {
        if (!incomingMap.has(edge.target)) {
          incomingMap.set(edge.target, []);
        }
        incomingMap.get(edge.target)?.push(edge);
      });

      const depthCache = new Map<string, number>();
      const calculateDepth = (nodeId: string, visited = new Set<string>()): number => {
        if (depthCache.has(nodeId)) {
          return depthCache.get(nodeId)!;
        }
        if (visited.has(nodeId)) {
          return 0;
        }

        visited.add(nodeId);
        const incoming = incomingMap.get(nodeId) || [];
        if (incoming.length === 0) {
          depthCache.set(nodeId, 0);
          return 0;
        }

        const depth = 1 + Math.max(...incoming.map((edge) => calculateDepth(edge.source, new Set(visited))));
        depthCache.set(nodeId, depth);
        return depth;
      };

      const grouped = new Map<number, Node<EditableNodeData>[]>();
      nodes.forEach((node) => {
        const depth = calculateDepth(node.id);
        if (!grouped.has(depth)) {
          grouped.set(depth, []);
        }
        grouped.get(depth)?.push(node);
      });

      const positions = new Map<string, { x: number; y: number }>();
      Array.from(grouped.keys()).sort((left, right) => left - right).forEach((depth, depthIndex) => {
        const levelNodes = (grouped.get(depth) || []).sort((left, right) => left.data.nodeType.localeCompare(right.data.nodeType));
        levelNodes.forEach((node, nodeIndex) => {
          positions.set(node.id, {
            x: START_X + depthIndex * HORIZONTAL_SPACING,
            y: START_Y + nodeIndex * VERTICAL_SPACING,
          });
        });
      });

      setNodes((currentNodes) => currentNodes.map((node) => ({
        ...node,
        position: positions.get(node.id) || node.position,
      })));
      setIsCleaning(false);
      setShowCleanConfirm(false);
    }, 650);
  }, [edges, nodes]);

  const handleValidateWithBackend = useCallback(async () => {
    setIsValidatingBackend(true);
    setValidationMessage('Validating workflow with backend rules…');

    try {
      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes, edges, dryRun: true }),
      });

      const result = await response.json();
      if (result.analysis) {
        setAnalysisResult(result.analysis);
      }

      if (!response.ok) {
        setValidationMessage(result.backendError || result.message || 'Backend validation failed.');
        return;
      }

      const queuedPlugins = result.backendPlan?.queued_plugins?.length ?? 0;
      setValidationMessage(`${result.message} Queued plugin deployments: ${queuedPlugins}.`);
    } catch (error) {
      setValidationMessage(error instanceof Error ? error.message : 'Backend validation failed.');
    } finally {
      setIsValidatingBackend(false);
    }
  }, [edges, nodes]);

  const handleDeploy = useCallback(async () => {
    setIsDeploying(true);
    setValidationMessage('Running deploy dry run…');

    try {
      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes, edges }),
      });

      const result = await response.json();
      if (result.analysis) {
        setAnalysisResult(result.analysis);
      }

      if (!response.ok) {
        setValidationMessage(result.backendError || result.message || 'Deployment dry run failed.');
        return;
      }

      const orderedNodes = result.backendPlan?.topological_order?.length ?? 0;
      setValidationMessage(`${result.message} Planned topological steps: ${orderedNodes}.`);
      setShowDeployConfirm(false);
    } catch (error) {
      setValidationMessage(error instanceof Error ? error.message : 'Deployment dry run failed.');
    } finally {
      setIsDeploying(false);
    }
  }, [edges, nodes]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget = target && (
        target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.isContentEditable
      );

      if (isTypingTarget) {
        return;
      }

      if (event.key === 's' || event.key === 'S') {
        event.preventDefault();
        onAddNode('sender');
      } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        onAddNode('receiver');
      } else if (event.key === 'p' || event.key === 'P') {
        event.preventDefault();
        onAddNode('plugin');
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedNodeForPanel) {
        event.preventDefault();
        handleDeleteNode(selectedNodeForPanel.id);
      } else if ((event.metaKey || event.ctrlKey) && (event.key === 'd' || event.key === 'D') && selectedNodeForPanel) {
        event.preventDefault();
        handleDuplicateNode(selectedNodeForPanel.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDeleteNode, handleDuplicateNode, onAddNode, selectedNodeForPanel]);

  const handleFocusIssue = useCallback((issue: AnalyzerIssue) => {
    setFocusedIssue(issue);
    const firstNodeId = issue.nodeIds[0];
    if (firstNodeId) {
      const node = nodes.find((candidate) => candidate.id === firstNodeId) || null;
      setSelectedNodeForPanel(node);
    }
  }, [nodes]);

  const issueSeverityByNode = useMemo(() => {
    const severityRank: Record<'error' | 'warning' | 'info', number> = {
      error: 3,
      warning: 2,
      info: 1,
    };

    const map = new Map<string, 'error' | 'warning' | 'info'>();
    for (const issue of analysisResult?.issues || []) {
      for (const nodeId of issue.nodeIds) {
        const current = map.get(nodeId);
        if (!current || severityRank[issue.severity] > severityRank[current]) {
          map.set(nodeId, issue.severity);
        }
      }
    }
    return map;
  }, [analysisResult]);

  const issueEdgeIds = useMemo(() => new Set(
    (analysisResult?.issues || [])
      .filter((issue) => issue.severity === 'error')
      .flatMap((issue) => issue.edgeIds || []),
  ), [analysisResult]);

  const decoratedNodes = useMemo(() => nodes.map((node) => {
    const severity = issueSeverityByNode.get(node.id);
    const isFocused = Boolean(focusedIssue?.nodeIds.includes(node.id));

    return {
      ...node,
      style: {
        ...node.style,
        outline: isFocused
          ? '3px solid #2563eb'
          : severity === 'error'
            ? '2px solid #dc2626'
            : severity === 'warning'
              ? '2px solid #eab308'
              : contextMenuNode?.id === node.id
                ? '2px solid #ef4444'
                : 'none',
        boxShadow: isFocused
          ? '0 0 0 4px rgba(37, 99, 235, 0.15)'
          : severity === 'error'
            ? '0 0 0 4px rgba(220, 38, 38, 0.12)'
            : severity === 'warning'
              ? '0 0 0 4px rgba(234, 179, 8, 0.12)'
              : contextMenuNode?.id === node.id
                ? '0 0 0 4px rgba(239, 68, 68, 0.12)'
                : 'none',
      },
    };
  }), [contextMenuNode, focusedIssue, issueSeverityByNode, nodes]);

  const decoratedEdges = useMemo(() => edges.map((edge) => {
    const streamType = getEdgeStreamType(edge);
    const isInvalid = issueEdgeIds.has(edge.id) || Boolean(focusedIssue?.edgeIds?.includes(edge.id));
    return {
      ...edge,
      type: 'animated',
      data: {
        ...(typeof edge.data === 'object' && edge.data ? edge.data : {}),
        streamType,
        label: streamType,
        invalid: isInvalid,
      },
    };
  }), [edges, focusedIssue, issueEdgeIds]);

  const canDeploy = analysisResult?.valid ?? false;

  return (
    <div ref={reactFlowWrapper} className="relative h-screen w-screen" style={{ background: 'hsl(240 10% 5%)' }}>
      {showDeployConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: 'hsl(240 8% 9%)', border: '1px solid hsl(240 6% 18%)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
            <h2 className="text-lg font-semibold" style={{ color: 'hsl(220 10% 92%)' }}>Deploy workflow</h2>
            <p className="mt-2 text-sm" style={{ color: 'hsl(220 10% 50%)' }}>
              This runs a deployment dry run against the backend validation path and updates the analyzer state with the result.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                className="rounded-lg px-4 py-2 text-sm transition-colors"
                style={{ border: '1px solid hsl(240 6% 20%)', color: 'hsl(220 10% 70%)', background: 'transparent' }}
                onClick={() => setShowDeployConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-all"
                style={{ background: 'linear-gradient(135deg, #00d4ff, #0077ff)', boxShadow: '0 4px 16px rgba(0, 212, 255, 0.25)' }}
                onClick={handleDeploy}
              >
                Confirm deploy
              </button>
            </div>
          </div>
        </div>
      )}

      {showCleanConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: 'hsl(240 8% 9%)', border: '1px solid hsl(240 6% 18%)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
            <h2 className="text-lg font-semibold" style={{ color: 'hsl(220 10% 92%)' }}>Clean workflow layout</h2>
            <p className="mt-2 text-sm" style={{ color: 'hsl(220 10% 50%)' }}>
              Nodes will be reorganized according to the current data-flow depth so the DAG is easier to inspect and validate.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                className="rounded-lg px-4 py-2 text-sm transition-colors"
                style={{ border: '1px solid hsl(240 6% 20%)', color: 'hsl(220 10% 70%)', background: 'transparent' }}
                onClick={() => setShowCleanConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="rounded-lg px-4 py-2 text-sm font-medium transition-all"
                style={{ background: '#fbbf24', color: 'hsl(240 10% 5%)', boxShadow: '0 4px 16px rgba(251, 191, 36, 0.2)' }}
                onClick={handleCleanWorkflow}
              >
                Clean layout
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={(isDeploying || isCleaning) ? 'pointer-events-none select-none opacity-60 blur-[1px]' : ''}>
        <CanvasPanel
          onAddNode={onAddNode}
          isSheetOpen={isLeftPanelOpen}
          setIsSheetOpen={setIsLeftPanelOpen}
          onDeploy={() => setShowDeployConfirm(true)}
          onValidateWithBackend={handleValidateWithBackend}
          isDeploying={isDeploying}
          isValidating={isValidatingBackend}
          onCleanWorkflow={() => setShowCleanConfirm(true)}
          isCleaning={isCleaning}
          canDeploy={canDeploy}
        />

        <ContextMenu onOpenChange={(open) => !open && setContextMenuNode(null)}>
          <ContextMenuTrigger asChild>
            <div className="h-screen w-screen" onDragOver={onDragOver} onDrop={onDrop}>
              <ReactFlow
                nodes={decoratedNodes}
                edges={decoratedEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onReconnect={onReconnect}
                onReconnectStart={onReconnectStart}
                onReconnectEnd={onReconnectEnd}
                onNodeClick={onNodeClick}
                onNodeContextMenu={onNodeContextMenu}
                onPaneClick={onPaneClick}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                defaultViewport={{ x: 0, y: 0, zoom: 1 }}
                fitView
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
                <ContextMenuItem onClick={() => handleDuplicateNode(contextMenuNode.id)}>
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate node
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem className="text-red-400 focus:bg-red-500/10 focus:text-red-400" onClick={() => handleDeleteNode(contextMenuNode.id)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete node
                </ContextMenuItem>
              </>
            ) : (
              <>
                <ContextMenuItem onClick={() => onAddNode('sender')}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add sender node
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onAddNode('receiver')}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add receiver node
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onAddNode('plugin')}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add plugin node
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        </ContextMenu>

        <ComponentPanel
          selectedNode={selectedNodeForPanel}
          nodes={nodes}
          edges={edges}
          analysisResult={analysisResult}
          onNodeDataChange={handleNodeDataChange}
          isOpen={Boolean(selectedNodeForPanel)}
          onClearSelection={handleComponentPanelClearSelection}
        />

        <AnalyzerPanel
          analysisResult={analysisResult}
          isValidating={isValidatingBackend}
          validationMessage={validationMessage}
          onValidateWithBackend={handleValidateWithBackend}
          onFocusIssue={handleFocusIssue}
        />
      </div>
    </div>
  );
}

export default function MinimalCanvas() {
  return (
    <ReactFlowProvider>
      <FlowContent />
    </ReactFlowProvider>
  );
}
