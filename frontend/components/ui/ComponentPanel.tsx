'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import type { Edge, Node } from '@xyflow/react';
import { AlertCircle, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, ChevronDown, ChevronRight, Info, Settings, User, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import type { AnalysisResult } from '@/lib/dag-analyzer';
import type { EditableNodeData } from '@/lib/types';
import { getSourceColors } from '@/lib/sourceColors';
import { getEdgeStreamType, getNodeRuntime } from '@/lib/workflow-validation';
import SecureTokenDisplay from './SecureTokenDisplay';
import DockerHubBrowser from './DockerHubBrowser';

function generateToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let index = 0; index < 36; index += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

interface ComponentPanelProps {
  selectedNode: Node<EditableNodeData> | null;
  nodes: Node<EditableNodeData>[];
  edges: Edge[];
  analysisResult: AnalysisResult | null;
  onNodeDataChange: (nodeId: string, newData: Partial<EditableNodeData>) => void;
  isOpen: boolean;
  onClearSelection: () => void;
}

function StatusBadge({ tone, children }: { tone: 'green' | 'yellow' | 'red' | 'slate'; children: React.ReactNode }) {
  const classes = {
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    yellow: 'border-yellow-200 bg-yellow-50 text-yellow-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  };

  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${classes[tone]}`}>{children}</span>;
}

export default function ComponentPanel({
  selectedNode,
  nodes,
  edges,
  analysisResult,
  onNodeDataChange,
  isOpen,
  onClearSelection,
}: ComponentPanelProps) {
  const [formData, setFormData] = useState<Partial<EditableNodeData>>({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [advancedChanges, setAdvancedChanges] = useState<Partial<EditableNodeData>>({});
  const [basePropsOpen, setBasePropsOpen] = useState(true);
  const [customPropsOpen, setCustomPropsOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [dockerHubOpen, setDockerHubOpen] = useState(false);

  const autoApplyChanges = useCallback((newData: Partial<EditableNodeData>) => {
    if (selectedNode) {
      onNodeDataChange(selectedNode.id, newData);
    }
  }, [onNodeDataChange, selectedNode]);

  useEffect(() => {
    if (selectedNode?.data) {
      setFormData({ ...selectedNode.data });
      setAdvancedChanges({});
      setShowConfirm(false);
      return;
    }

    setFormData({});
    setAdvancedChanges({});
    setShowConfirm(false);
  }, [selectedNode]);

  const connectionSummary = useMemo(() => {
    if (!selectedNode) {
      return { incoming: [] as Edge[], outgoing: [] as Edge[] };
    }

    return {
      incoming: edges.filter((edge) => edge.target === selectedNode.id),
      outgoing: edges.filter((edge) => edge.source === selectedNode.id),
    };
  }, [edges, selectedNode]);

  const relatedIssues = useMemo(() => {
    if (!selectedNode || !analysisResult) {
      return [];
    }

    return analysisResult.issues.filter((issue) => issue.nodeIds.includes(selectedNode.id));
  }, [analysisResult, selectedNode]);

  const requiredFields = useMemo(() => {
    if (!selectedNode) {
      return [] as string[];
    }

    const missing = [] as string[];
    if (!String(formData.name || '').trim()) {
      missing.push('Name');
    }
    if (selectedNode.data.nodeType === 'plugin' && !getNodeRuntime({ ...selectedNode, data: formData as EditableNodeData })) {
      missing.push('Runtime image');
    }
    return missing;
  }, [formData, selectedNode]);

  const runtimeStatus = useMemo(() => {
    if (!selectedNode || selectedNode.data.nodeType !== 'plugin') {
      return { label: 'Not applicable', tone: 'slate' as const };
    }

    const runtime = getNodeRuntime({ ...selectedNode, data: formData as EditableNodeData });
    if (!runtime) {
      return { label: 'Missing runtime', tone: 'red' as const };
    }
    if (formData.runtimeApproved === false || formData.runtimeApprovalStatus === 'unapproved' || formData.approvalStatus === 'unapproved') {
      return { label: 'Unapproved runtime', tone: 'yellow' as const };
    }
    return { label: 'Approved runtime', tone: 'green' as const };
  }, [formData, selectedNode]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>, isAdvanced = false) => {
    const { name, value } = event.target;
    const newData = { [name]: value } as Partial<EditableNodeData>;

    setFormData((current) => ({ ...current, ...newData }));
    if (isAdvanced) {
      setAdvancedChanges((current) => ({ ...current, ...newData }));
      return;
    }

    autoApplyChanges(newData);
  };

  const handleSourceChange = (index: number, value: string) => {
    const newSources = (formData.sources || []).map((source: string, currentIndex: number) => currentIndex === index ? value : source);
    const newData = { sources: newSources };
    setFormData((current) => ({ ...current, ...newData }));
    autoApplyChanges(newData);
  };

  const handleAddSource = () => {
    const newSources = [...(formData.sources || []), ''];
    const newData = { sources: newSources };
    setFormData((current) => ({ ...current, ...newData }));
    autoApplyChanges(newData);
  };

  const handleRemoveSource = (index: number) => {
    const newSources = (formData.sources || []).filter((_: string, currentIndex: number) => currentIndex !== index);
    const newData = { sources: newSources };
    setFormData((current) => ({ ...current, ...newData }));
    autoApplyChanges(newData);
  };

  const handleAccessTypeChange = (field: string, value: unknown) => {
    const newData = {
      access_types: {
        ...formData.access_types,
        [field]: value,
      },
    };
    setFormData((current) => ({ ...current, ...newData }));
    autoApplyChanges(newData);
  };

  const handleSubmit = () => {
    if (selectedNode && Object.keys(advancedChanges).length > 0) {
      onNodeDataChange(selectedNode.id, advancedChanges);
      setAdvancedChanges({});
      toast.success('Advanced settings applied.');
    }
  };

  const handleRegenerateToken = () => setShowConfirm(true);

  const confirmRegenerateToken = () => {
    const newToken = generateToken();
    setFormData((current) => ({ ...current, token: newToken }));
    setAdvancedChanges((current) => ({ ...current, token: newToken }));
    setShowConfirm(false);
    toast.success('Token regenerated.');
  };

  const customProps = useMemo(() => {
    const standardFields = ['name', 'description', 'token', 'access_types', 'nodeType', 'sources', 'runtime', 'containerImage', 'runtimeApproved', 'runtimeApprovalStatus', 'approvalStatus'];
    return Object.keys(formData).reduce<Record<string, unknown>>((accumulator, key) => {
      if (!standardFields.includes(key)) {
        accumulator[key] = formData[key as keyof EditableNodeData];
      }
      return accumulator;
    }, {});
  }, [formData]);

  if (!selectedNode) {
    return (
      <Sheet open={isOpen} onOpenChange={onClearSelection} modal={false}>
        <SheetContent side="right" className="w-[320px] border-none sm:w-[420px]">
          <SheetHeader>
            <SheetTitle>No node selected</SheetTitle>
            <SheetDescription>
              Select a node on the canvas to inspect connections, readiness status, and editable properties.
            </SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    );
  }

  const nodeLookup = new Map(nodes.map((node) => [node.id, node]));
  const nodeType = selectedNode.data.nodeType;
  const relatedErrorCount = relatedIssues.filter((issue) => issue.severity === 'error').length;
  const relatedWarningCount = relatedIssues.filter((issue) => issue.severity === 'warning').length;

  return (
    <Sheet open={isOpen} onOpenChange={onClearSelection} modal={false}>
      <SheetContent side="right" className="w-[320px] overflow-y-auto border-none sm:w-[420px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Inspect node
          </SheetTitle>
          <SheetDescription>
            Review deploy readiness, connection context, and editable properties for {formData.name || selectedNode.id}.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-900">{formData.name || selectedNode.id}</div>
                <div className="text-xs uppercase tracking-wide text-slate-500">{nodeType} node</div>
              </div>
              <StatusBadge tone={runtimeStatus.tone}>{runtimeStatus.label}</StatusBadge>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <ArrowDownToLine className="h-3.5 w-3.5" /> Incoming
                </div>
                <div className="mt-2 text-lg font-semibold text-slate-900">{connectionSummary.incoming.length}</div>
                <div className="mt-1 text-xs text-slate-600">
                  {connectionSummary.incoming.length > 0
                    ? connectionSummary.incoming.map((edge) => nodeLookup.get(edge.source)?.data.name || edge.source).join(', ')
                    : 'No upstream dependencies'}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <ArrowUpFromLine className="h-3.5 w-3.5" /> Outgoing
                </div>
                <div className="mt-2 text-lg font-semibold text-slate-900">{connectionSummary.outgoing.length}</div>
                <div className="mt-1 text-xs text-slate-600">
                  {connectionSummary.outgoing.length > 0
                    ? connectionSummary.outgoing.map((edge) => nodeLookup.get(edge.target)?.data.name || edge.target).join(', ')
                    : 'No downstream consumers'}
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge tone={relatedErrorCount > 0 ? 'red' : 'green'}>
                {relatedErrorCount} blocker{relatedErrorCount === 1 ? '' : 's'}
              </StatusBadge>
              <StatusBadge tone={relatedWarningCount > 0 ? 'yellow' : 'slate'}>
                {relatedWarningCount} warning{relatedWarningCount === 1 ? '' : 's'}
              </StatusBadge>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <AlertCircle className="h-4 w-4 text-slate-500" />
              Required fields and compatibility
            </div>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <span>Name</span>
                {requiredFields.includes('Name') ? <StatusBadge tone="red">Missing</StatusBadge> : <StatusBadge tone="green">Ready</StatusBadge>}
              </div>
              {nodeType === 'plugin' && (
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <span>Runtime image</span>
                  {requiredFields.includes('Runtime image') ? <StatusBadge tone="red">Missing</StatusBadge> : <StatusBadge tone={runtimeStatus.tone}>{runtimeStatus.label}</StatusBadge>}
                </div>
              )}
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Stream paths touching this node: {[...connectionSummary.incoming, ...connectionSummary.outgoing].map((edge) => getEdgeStreamType(edge)).join(', ') || 'No active connections'}
              </div>
            </div>
          </div>

          <Collapsible open={basePropsOpen} onOpenChange={setBasePropsOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-slate-50 p-3 text-left">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-blue-600" />
                <span className="font-medium text-slate-900">Base properties</span>
              </div>
              {basePropsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-3">
              <div>
                <label className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-700">
                  Name
                  {!String(formData.name || '').trim() && <span className="h-2 w-2 rounded-full bg-red-500" />}
                </label>
                <Input name="name" value={formData.name || ''} onChange={handleInputChange} placeholder="Enter node name" />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
                <Textarea name="description" value={formData.description || ''} onChange={handleInputChange} rows={3} placeholder="Enter a short description" />
              </div>

              {nodeType === 'plugin' && (
                <div>
                  <label className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-700">
                    Runtime image
                    {!getNodeRuntime({ ...selectedNode, data: formData as EditableNodeData }) && <span className="h-2 w-2 rounded-full bg-red-500" />}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      name="runtime"
                      value={typeof formData.runtime === 'string' ? formData.runtime : typeof formData.containerImage === 'string' ? formData.containerImage : ''}
                      onChange={handleInputChange}
                      placeholder="e.g. ghcr.io/org/plugin:latest"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setDockerHubOpen(true)}
                      title="Browse Docker Hub"
                    >
                      Browse
                    </Button>
                  </div>
                  <DockerHubBrowser
                    open={dockerHubOpen}
                    onClose={() => setDockerHubOpen(false)}
                    onSelect={(imageRef) => {
                      const newData = { runtime: imageRef };
                      setFormData((current) => ({ ...current, ...newData }));
                      autoApplyChanges(newData);
                    }}
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Sources ({(formData.sources || []).length})</label>
                <div className="space-y-2">
                  {getSourceColors(formData.sources || []).map(({ source, color }, index) => (
                    <div key={`${source}-${index}`} className="flex items-center gap-2">
                      <div className="h-4 w-4 flex-shrink-0 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: color }} />
                      <Input value={source} onChange={(event) => handleSourceChange(index, event.target.value)} placeholder={`Source ${index + 1}`} className="flex-1" />
                      <Button type="button" variant="ghost" size="sm" className="text-red-500" onClick={() => handleRemoveSource(index)}>
                        ×
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" className="w-full" onClick={handleAddSource}>
                    Add source
                  </Button>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-sm font-medium text-slate-900">Access types</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={formData.access_types?.canSend !== false}
                      onChange={(event) => handleAccessTypeChange('canSend', event.target.checked)}
                    />
                    Can send
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={formData.access_types?.canReceive !== false}
                      onChange={(event) => handleAccessTypeChange('canReceive', event.target.checked)}
                    />
                    Can receive
                  </label>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Allowed send types</label>
                  <Input
                    value={(formData.access_types?.allowedSendTypes || []).join(', ')}
                    onChange={(event) => handleAccessTypeChange('allowedSendTypes', event.target.value.split(',').map((entry) => entry.trim()).filter(Boolean))}
                    placeholder="e.g. json, text, binary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Allowed receive types</label>
                  <Input
                    value={(formData.access_types?.allowedReceiveTypes || []).join(', ')}
                    onChange={(event) => handleAccessTypeChange('allowedReceiveTypes', event.target.value.split(',').map((entry) => entry.trim()).filter(Boolean))}
                    placeholder="e.g. json, text, binary"
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {Object.keys(customProps).length > 0 && (
            <Collapsible open={customPropsOpen} onOpenChange={setCustomPropsOpen}>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-violet-50 p-3 text-left">
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-violet-600" />
                  <span className="font-medium text-slate-900">Custom properties</span>
                </div>
                {customPropsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-3">
                {Object.entries(customProps).map(([key, value]) => (
                  <div key={key}>
                    <label className="mb-1 block text-sm font-medium capitalize text-slate-700">{key.replace(/_/g, ' ')}</label>
                    <Input
                      type="text"
                      value={typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')}
                      onChange={(event) => setFormData((current) => ({ ...current, [key]: event.target.value }))}
                      placeholder={`Enter ${key}`}
                    />
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-red-50 p-3 text-left">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-red-600" />
                <span className="font-medium text-slate-900">Advanced</span>
              </div>
              {advancedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-3">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <label className="text-sm font-medium text-slate-700">Auth token</label>
                  <Info className="h-4 w-4 text-slate-400" />
                </div>
                <SecureTokenDisplay token={String(formData.token || '')} />
              </div>

              <div className="border-t pt-3">
                <Button type="button" variant="destructive" size="sm" onClick={handleRegenerateToken} className="w-full">
                  Regenerate token
                </Button>
                {showConfirm && (
                  <div className="mt-3 rounded border border-yellow-300 bg-yellow-50 p-3">
                    <div className="text-sm font-medium text-yellow-900">Regenerate token?</div>
                    <div className="mt-1 text-xs text-yellow-800">This may invalidate existing integrations that rely on the current token.</div>
                    <div className="mt-3 flex gap-2">
                      <Button type="button" size="sm" variant="destructive" className="flex-1" onClick={confirmRegenerateToken}>
                        Yes, regenerate
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="flex-1" onClick={() => setShowConfirm(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {Object.keys(advancedChanges).length > 0 && (
            <Button onClick={handleSubmit} className="w-full" size="lg">
              Apply advanced changes ({Object.keys(advancedChanges).length})
            </Button>
          )}

          <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Basic property changes apply automatically.
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
