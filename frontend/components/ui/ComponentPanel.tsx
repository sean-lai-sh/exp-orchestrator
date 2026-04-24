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
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    green: { bg: 'rgba(52,211,153,0.1)', color: '#34d399', border: 'rgba(52,211,153,0.2)' },
    yellow: { bg: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: 'rgba(251,191,36,0.2)' },
    red: { bg: 'rgba(248,113,113,0.1)', color: '#f87171', border: 'rgba(248,113,113,0.2)' },
    slate: { bg: 'rgba(255,255,255,0.04)', color: 'hsl(220 10% 50%)', border: 'rgba(255,255,255,0.06)' },
  };
  const s = styles[tone];

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {children}
    </span>
  );
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
    if (!selectedNode) return { incoming: [] as Edge[], outgoing: [] as Edge[] };
    return {
      incoming: edges.filter((edge) => edge.target === selectedNode.id),
      outgoing: edges.filter((edge) => edge.source === selectedNode.id),
    };
  }, [edges, selectedNode]);

  const relatedIssues = useMemo(() => {
    if (!selectedNode || !analysisResult) return [];
    return analysisResult.issues.filter((issue) => issue.nodeIds.includes(selectedNode.id));
  }, [analysisResult, selectedNode]);

  const requiredFields = useMemo(() => {
    if (!selectedNode) return [] as string[];
    const missing = [] as string[];
    if (!String(formData.name || '').trim()) missing.push('Name');
    if (selectedNode.data.nodeType === 'plugin' && !getNodeRuntime({ ...selectedNode, data: formData as EditableNodeData })) missing.push('Runtime image');
    return missing;
  }, [formData, selectedNode]);

  const runtimeStatus = useMemo(() => {
    if (!selectedNode || selectedNode.data.nodeType !== 'plugin') return { label: 'Not applicable', tone: 'slate' as const };
    const runtime = getNodeRuntime({ ...selectedNode, data: formData as EditableNodeData });
    if (!runtime) return { label: 'Missing runtime', tone: 'red' as const };
    if (formData.runtimeApproved === false || formData.runtimeApprovalStatus === 'unapproved' || formData.approvalStatus === 'unapproved') return { label: 'Unapproved runtime', tone: 'yellow' as const };
    return { label: 'Approved runtime', tone: 'green' as const };
  }, [formData, selectedNode]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>, isAdvanced = false) => {
    const { name, value } = event.target;
    const newData = { [name]: value } as Partial<EditableNodeData>;
    setFormData((current) => ({ ...current, ...newData }));
    if (isAdvanced) { setAdvancedChanges((current) => ({ ...current, ...newData })); return; }
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
    const newData = { access_types: { ...formData.access_types, [field]: value } };
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
      if (!standardFields.includes(key)) accumulator[key] = formData[key as keyof EditableNodeData];
      return accumulator;
    }, {});
  }, [formData]);

  // Dark theme color constants
  const surface = 'hsl(240 8% 9%)';
  const surfaceElevated = 'hsl(240 8% 11%)';
  const borderColor = 'hsl(240 6% 18%)';
  const borderSubtle = 'hsl(240 6% 14%)';
  const textPrimary = 'hsl(220 10% 92%)';
  const textSecondary = 'hsl(220 10% 70%)';
  const textMuted = 'hsl(220 10% 45%)';

  const accentMap: Record<string, string> = { sender: '#00d4ff', receiver: '#34d399', plugin: '#fbbf24' };

  if (!selectedNode) {
    return (
      <Sheet open={isOpen} onOpenChange={onClearSelection} modal={false}>
        <SheetContent
          side="right"
          className="w-[320px] border-l sm:w-[420px]"
          style={{ background: 'hsl(240 8% 7%)', borderColor: borderSubtle }}
        >
          <SheetHeader>
            <SheetTitle style={{ color: textPrimary }}>No node selected</SheetTitle>
            <SheetDescription style={{ color: textMuted }}>
              Select a node on the canvas to inspect connections, readiness status, and editable properties.
            </SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    );
  }

  const nodeLookup = new Map(nodes.map((node) => [node.id, node]));
  const nodeType = selectedNode.data.nodeType;
  const accent = accentMap[nodeType] || '#00d4ff';
  const relatedErrorCount = relatedIssues.filter((issue) => issue.severity === 'error').length;
  const relatedWarningCount = relatedIssues.filter((issue) => issue.severity === 'warning').length;

  return (
    <Sheet open={isOpen} onOpenChange={onClearSelection} modal={false}>
      <SheetContent
        side="right"
        className="w-[320px] overflow-y-auto border-l sm:w-[420px]"
        style={{ background: 'hsl(240 8% 7%)', borderColor: borderSubtle }}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2" style={{ color: textPrimary }}>
            <User className="h-4 w-4" style={{ color: accent }} />
            Inspect node
          </SheetTitle>
          <SheetDescription style={{ color: textMuted }}>
            Review deploy readiness for {formData.name || selectedNode.id}.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Node summary card */}
          <div className="rounded-xl p-4" style={{ background: surface, border: `1px solid ${borderColor}` }}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold" style={{ color: textPrimary }}>{formData.name || selectedNode.id}</div>
                <div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: accent }}>{nodeType} node</div>
              </div>
              <StatusBadge tone={runtimeStatus.tone}>{runtimeStatus.label}</StatusBadge>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg p-3" style={{ background: surfaceElevated, border: `1px solid ${borderColor}` }}>
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider" style={{ color: textMuted }}>
                  <ArrowDownToLine className="h-3 w-3" /> Incoming
                </div>
                <div className="mt-1.5 text-lg font-semibold" style={{ color: textPrimary }}>{connectionSummary.incoming.length}</div>
                <div className="mt-0.5 text-[11px]" style={{ color: textMuted }}>
                  {connectionSummary.incoming.length > 0
                    ? connectionSummary.incoming.map((edge) => nodeLookup.get(edge.source)?.data.name || edge.source).join(', ')
                    : 'No upstream'}
                </div>
              </div>
              <div className="rounded-lg p-3" style={{ background: surfaceElevated, border: `1px solid ${borderColor}` }}>
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider" style={{ color: textMuted }}>
                  <ArrowUpFromLine className="h-3 w-3" /> Outgoing
                </div>
                <div className="mt-1.5 text-lg font-semibold" style={{ color: textPrimary }}>{connectionSummary.outgoing.length}</div>
                <div className="mt-0.5 text-[11px]" style={{ color: textMuted }}>
                  {connectionSummary.outgoing.length > 0
                    ? connectionSummary.outgoing.map((edge) => nodeLookup.get(edge.target)?.data.name || edge.target).join(', ')
                    : 'No downstream'}
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

          {/* Required fields */}
          <div className="rounded-xl p-4" style={{ background: surface, border: `1px solid ${borderColor}` }}>
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: textSecondary }}>
              <AlertCircle className="h-4 w-4" style={{ color: textMuted }} />
              Required fields
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: surfaceElevated, border: `1px solid ${borderColor}`, color: textSecondary }}>
                <span>Name</span>
                {requiredFields.includes('Name') ? <StatusBadge tone="red">Missing</StatusBadge> : <StatusBadge tone="green">Ready</StatusBadge>}
              </div>
              {nodeType === 'plugin' && (
                <div className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: surfaceElevated, border: `1px solid ${borderColor}`, color: textSecondary }}>
                  <span>Runtime image</span>
                  {requiredFields.includes('Runtime image') ? <StatusBadge tone="red">Missing</StatusBadge> : <StatusBadge tone={runtimeStatus.tone}>{runtimeStatus.label}</StatusBadge>}
                </div>
              )}
              <div className="rounded-lg px-3 py-2 text-[11px]" style={{ background: surfaceElevated, border: `1px solid ${borderColor}`, color: textMuted }}>
                Stream paths: {[...connectionSummary.incoming, ...connectionSummary.outgoing].map((edge) => getEdgeStreamType(edge)).join(', ') || 'No connections'}
              </div>
            </div>
          </div>

          {/* Base properties */}
          <Collapsible open={basePropsOpen} onOpenChange={setBasePropsOpen}>
            <CollapsibleTrigger
              className="flex w-full items-center justify-between rounded-lg p-3 text-left transition-colors"
              style={{ background: surface, border: `1px solid ${borderColor}` }}
            >
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4" style={{ color: accent }} />
                <span className="font-medium" style={{ color: textSecondary }}>Base properties</span>
              </div>
              {basePropsOpen ? <ChevronDown className="h-4 w-4" style={{ color: textMuted }} /> : <ChevronRight className="h-4 w-4" style={{ color: textMuted }} />}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-3">
              <div>
                <label className="mb-1 flex items-center gap-2 text-sm font-medium" style={{ color: textSecondary }}>
                  Name
                  {!String(formData.name || '').trim() && <span className="h-2 w-2 rounded-full bg-red-500" />}
                </label>
                <Input
                  name="name" value={formData.name || ''} onChange={handleInputChange} placeholder="Enter node name"
                  style={{ background: surface, borderColor, color: textPrimary }}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: textSecondary }}>Description</label>
                <Textarea
                  name="description" value={formData.description || ''} onChange={handleInputChange} rows={3} placeholder="Enter description"
                  style={{ background: surface, borderColor, color: textPrimary }}
                />
              </div>

              {nodeType === 'plugin' && (
                <div>
                  <label className="mb-1 flex items-center gap-2 text-sm font-medium" style={{ color: textSecondary }}>
                    Runtime image
                    {!getNodeRuntime({ ...selectedNode, data: formData as EditableNodeData }) && <span className="h-2 w-2 rounded-full bg-red-500" />}
                  </label>
                  <Input
                    name="runtime"
                    value={typeof formData.runtime === 'string' ? formData.runtime : typeof formData.containerImage === 'string' ? formData.containerImage : ''}
                    onChange={handleInputChange}
                    placeholder="e.g. ghcr.io/org/plugin:latest"
                    style={{ background: surface, borderColor, color: textPrimary }}
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: textSecondary }}>Sources ({(formData.sources || []).length})</label>
                <div className="space-y-2">
                  {getSourceColors(formData.sources || []).map(({ source, color }, index) => (
                    <div key={`${source}-${index}`} className="flex items-center gap-2">
                      <div
                        className="h-4 w-4 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: color, border: '2px solid hsl(240 8% 11%)', boxShadow: `0 0 6px ${color}40` }}
                      />
                      <Input
                        value={source} onChange={(event) => handleSourceChange(index, event.target.value)} placeholder={`Source ${index + 1}`} className="flex-1"
                        style={{ background: surface, borderColor, color: textPrimary }}
                      />
                      <button
                        onClick={() => handleRemoveSource(index)}
                        className="rounded px-2 py-1 text-sm transition-colors"
                        style={{ color: '#f87171' }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={handleAddSource}
                    className="w-full rounded-lg px-3 py-2 text-sm transition-colors"
                    style={{ background: 'transparent', border: `1px dashed ${borderColor}`, color: textMuted }}
                  >
                    + Add source
                  </button>
                </div>
              </div>

              <div className="space-y-3 rounded-lg p-3" style={{ background: surface, border: `1px solid ${borderColor}` }}>
                <div className="text-sm font-medium" style={{ color: textSecondary }}>Access types</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm" style={{ color: textMuted }}>
                    <input
                      type="checkbox"
                      checked={formData.access_types?.canSend !== false}
                      onChange={(event) => handleAccessTypeChange('canSend', event.target.checked)}
                      className="rounded"
                    />
                    Can send
                  </label>
                  <label className="flex items-center gap-2 text-sm" style={{ color: textMuted }}>
                    <input
                      type="checkbox"
                      checked={formData.access_types?.canReceive !== false}
                      onChange={(event) => handleAccessTypeChange('canReceive', event.target.checked)}
                      className="rounded"
                    />
                    Can receive
                  </label>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" style={{ color: textSecondary }}>Allowed send types</label>
                  <Input
                    value={(formData.access_types?.allowedSendTypes || []).join(', ')}
                    onChange={(event) => handleAccessTypeChange('allowedSendTypes', event.target.value.split(',').map((entry) => entry.trim()).filter(Boolean))}
                    placeholder="e.g. json, text, binary"
                    style={{ background: surfaceElevated, borderColor, color: textPrimary }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" style={{ color: textSecondary }}>Allowed receive types</label>
                  <Input
                    value={(formData.access_types?.allowedReceiveTypes || []).join(', ')}
                    onChange={(event) => handleAccessTypeChange('allowedReceiveTypes', event.target.value.split(',').map((entry) => entry.trim()).filter(Boolean))}
                    placeholder="e.g. json, text, binary"
                    style={{ background: surfaceElevated, borderColor, color: textPrimary }}
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Custom properties */}
          {Object.keys(customProps).length > 0 && (
            <Collapsible open={customPropsOpen} onOpenChange={setCustomPropsOpen}>
              <CollapsibleTrigger
                className="flex w-full items-center justify-between rounded-lg p-3 text-left"
                style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)' }}
              >
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4" style={{ color: '#a78bfa' }} />
                  <span className="font-medium" style={{ color: textSecondary }}>Custom properties</span>
                </div>
                {customPropsOpen ? <ChevronDown className="h-4 w-4" style={{ color: textMuted }} /> : <ChevronRight className="h-4 w-4" style={{ color: textMuted }} />}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-3">
                {Object.entries(customProps).map(([key, value]) => (
                  <div key={key}>
                    <label className="mb-1 block text-sm font-medium capitalize" style={{ color: textSecondary }}>{key.replace(/_/g, ' ')}</label>
                    <Input
                      type="text"
                      value={typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')}
                      onChange={(event) => setFormData((current) => ({ ...current, [key]: event.target.value }))}
                      placeholder={`Enter ${key}`}
                      style={{ background: surface, borderColor, color: textPrimary }}
                    />
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Advanced */}
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger
              className="flex w-full items-center justify-between rounded-lg p-3 text-left"
              style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.12)' }}
            >
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4" style={{ color: '#f87171' }} />
                <span className="font-medium" style={{ color: textSecondary }}>Advanced</span>
              </div>
              {advancedOpen ? <ChevronDown className="h-4 w-4" style={{ color: textMuted }} /> : <ChevronRight className="h-4 w-4" style={{ color: textMuted }} />}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-3">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <label className="text-sm font-medium" style={{ color: textSecondary }}>Auth token</label>
                  <Info className="h-4 w-4" style={{ color: textMuted }} />
                </div>
                <SecureTokenDisplay token={String(formData.token || '')} />
              </div>
              <div style={{ borderTop: `1px solid ${borderColor}`, paddingTop: '12px' }}>
                <button
                  onClick={handleRegenerateToken}
                  className="w-full rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                  style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}
                >
                  Regenerate token
                </button>
                {showConfirm && (
                  <div className="mt-3 rounded-lg p-3" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
                    <div className="text-sm font-medium" style={{ color: '#fbbf24' }}>Regenerate token?</div>
                    <div className="mt-1 text-[11px]" style={{ color: textMuted }}>This may invalidate existing integrations.</div>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={confirmRegenerateToken}
                        className="flex-1 rounded-lg px-3 py-2 text-sm font-medium"
                        style={{ background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}
                      >
                        Yes, regenerate
                      </button>
                      <button
                        onClick={() => setShowConfirm(false)}
                        className="flex-1 rounded-lg px-3 py-2 text-sm"
                        style={{ background: 'transparent', color: textMuted, border: `1px solid ${borderColor}` }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {Object.keys(advancedChanges).length > 0 && (
            <button
              onClick={handleSubmit}
              className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold"
              style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, color: 'hsl(240 10% 5%)', boxShadow: `0 4px 16px ${accent}25` }}
            >
              Apply advanced changes ({Object.keys(advancedChanges).length})
            </button>
          )}

          <div className="flex items-center justify-center gap-2 text-[11px]" style={{ color: textMuted }}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            Basic changes apply automatically.
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
