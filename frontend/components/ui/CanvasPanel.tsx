'use client';

import { useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { NodeTemplate, NodeType } from '@/lib/types';
import { nodeTemplates, templatesByType } from '@/lib/nodeTemplates';
import { ChevronDown, Inbox, Keyboard, Puzzle, Search, Send, Sparkles, Rocket, Shield, PanelLeft } from 'lucide-react';

interface CanvasPanelProps {
  onAddNode: (type: NodeType, template?: NodeTemplate) => void;
  isSheetOpen: boolean;
  setIsSheetOpen: (isOpen: boolean) => void;
  onDeploy: () => void;
  onValidateWithBackend: () => void;
  isDeploying: boolean;
  isValidating: boolean;
  onCleanWorkflow: () => void;
  isCleaning: boolean;
  canDeploy: boolean;
}

const quickAddPalette: Array<{
  type: NodeType;
  label: string;
  shortcut: string;
  description: string;
  icon: ReactNode;
  accent: string;
  accentBg: string;
}> = [
  {
    type: 'sender',
    label: 'Sender',
    shortcut: 'S',
    description: 'Source nodes that emit data into the DAG.',
    icon: <Send className="h-3.5 w-3.5" />,
    accent: '#00d4ff',
    accentBg: 'rgba(0, 212, 255, 0.08)',
  },
  {
    type: 'receiver',
    label: 'Receiver',
    shortcut: 'R',
    description: 'Terminal nodes that consume workflow outputs.',
    icon: <Inbox className="h-3.5 w-3.5" />,
    accent: '#34d399',
    accentBg: 'rgba(52, 211, 153, 0.08)',
  },
  {
    type: 'plugin',
    label: 'Plugin',
    shortcut: 'P',
    description: 'Processing steps that transform or route data.',
    icon: <Puzzle className="h-3.5 w-3.5" />,
    accent: '#fbbf24',
    accentBg: 'rgba(251, 191, 36, 0.08)',
  },
];

function TemplateButton({
  template,
  onSelect,
}: {
  template: NodeTemplate;
  onSelect: (template: NodeTemplate) => void;
}) {
  const accentMap: Record<string, string> = {
    sender: '#00d4ff',
    receiver: '#34d399',
    plugin: '#fbbf24',
  };
  const accent = accentMap[template.type] || '#00d4ff';

  const handleDragStart = (event: DragEvent<HTMLButtonElement>) => {
    event.dataTransfer.setData('application/reactflow-type', template.type);
    event.dataTransfer.setData('application/reactflow-template', JSON.stringify(template));
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <button
      type="button"
      draggable
      onDragStart={handleDragStart}
      onClick={() => onSelect(template)}
      className="w-full rounded-lg p-3 text-left transition-all duration-150 hover:scale-[1.01]"
      style={{
        background: 'hsl(240 8% 9%)',
        border: '1px solid hsl(240 6% 18%)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = `${accent}40`;
        e.currentTarget.style.background = 'hsl(240 8% 11%)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'hsl(240 6% 18%)';
        e.currentTarget.style.background = 'hsl(240 8% 9%)';
      }}
      title="Click to add at center or drag onto the canvas"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium" style={{ color: 'hsl(220 10% 85%)' }}>{template.name}</span>
        <span
          className="rounded-full px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider"
          style={{ background: `${accent}15`, color: accent }}
        >
          {template.type}
        </span>
      </div>
      <p className="mt-1 text-[11px]" style={{ color: 'hsl(220 10% 45%)' }}>{template.description}</p>
    </button>
  );
}

export default function CanvasPanel({
  onAddNode,
  isSheetOpen,
  setIsSheetOpen,
  onDeploy,
  onValidateWithBackend,
  isDeploying,
  isValidating,
  onCleanWorkflow,
  isCleaning,
  canDeploy,
}: CanvasPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [openSections, setOpenSections] = useState<Record<NodeType, boolean>>({
    sender: true,
    receiver: true,
    plugin: true,
  });

  const filteredTemplates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return nodeTemplates.filter((template) =>
      [template.name, template.description, template.type, template.category]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [searchQuery]);

  const handleTemplateSelect = (template: NodeTemplate) => {
    onAddNode(template.type, template);
    setSearchQuery('');
  };

  const handleQuickAddDragStart = (event: DragEvent<HTMLButtonElement>, type: NodeType) => {
    event.dataTransfer.setData('application/reactflow-type', type);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen} modal={false}>
      <SheetTrigger asChild>
        <button
          className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 toolbar-float-in"
          style={{
            background: 'hsl(240 8% 9%)',
            border: '1px solid hsl(240 6% 18%)',
            color: 'hsl(220 10% 70%)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
          }}
          onClick={() => setIsSheetOpen(!isSheetOpen)}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'hsl(195 100% 50%)';
            e.currentTarget.style.color = 'hsl(220 10% 90%)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'hsl(240 6% 18%)';
            e.currentTarget.style.color = 'hsl(220 10% 70%)';
          }}
        >
          <PanelLeft className="h-4 w-4" />
          {isSheetOpen ? 'Hide' : 'Controls'}
        </button>
      </SheetTrigger>

      <SheetContent
        side="left"
        className="w-[340px] overflow-y-auto sm:w-[400px] border-r"
        style={{
          background: 'hsl(240 8% 7%)',
          borderColor: 'hsl(240 6% 14%)',
        }}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle style={{ color: 'hsl(220 10% 92%)' }}>
            Workflow Editor
          </SheetTitle>
          <SheetDescription style={{ color: 'hsl(220 10% 45%)' }}>
            Create, inspect, validate, and deploy nodes.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Keyboard shortcuts */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'hsl(220 10% 70%)' }}>
              <Keyboard className="h-4 w-4" style={{ color: 'hsl(220 10% 40%)' }} />
              Shortcuts
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px]" style={{ color: 'hsl(220 10% 50%)' }}>
              {['S = Sender', 'R = Receiver', 'P = Plugin'].map((s) => (
                <div
                  key={s}
                  className="rounded-lg px-3 py-2 text-center font-mono"
                  style={{ background: 'hsl(240 8% 9%)', border: '1px solid hsl(240 6% 16%)' }}
                >
                  {s}
                </div>
              ))}
              <div
                className="col-span-3 rounded-lg px-3 py-2 text-center font-mono"
                style={{ background: 'hsl(240 8% 9%)', border: '1px solid hsl(240 6% 16%)' }}
              >
                Del / Backspace = Remove node
              </div>
            </div>
          </section>

          {/* Quick add */}
          <section className="space-y-3">
            <div className="text-sm font-medium" style={{ color: 'hsl(220 10% 70%)' }}>Quick add</div>
            <div className="grid gap-2">
              {quickAddPalette.map((entry) => (
                <button
                  key={entry.type}
                  type="button"
                  draggable
                  onDragStart={(event) => handleQuickAddDragStart(event, entry.type)}
                  onClick={() => onAddNode(entry.type)}
                  className="rounded-xl p-3 text-left transition-all duration-150"
                  style={{
                    background: entry.accentBg,
                    border: `1px solid ${entry.accent}20`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = `${entry.accent}50`;
                    e.currentTarget.style.boxShadow = `0 0 16px ${entry.accent}10`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = `${entry.accent}20`;
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  title="Click to add at center or drag onto the canvas"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: entry.accent }}>
                      <span className="flex items-center justify-center w-6 h-6 rounded-md" style={{ background: `${entry.accent}15` }}>
                        {entry.icon}
                      </span>
                      {entry.label}
                    </span>
                    <span
                      className="rounded-md px-2 py-0.5 text-[10px] font-mono font-semibold"
                      style={{ background: `${entry.accent}12`, color: `${entry.accent}90` }}
                    >
                      {entry.shortcut}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] pl-8" style={{ color: 'hsl(220 10% 45%)' }}>{entry.description}</p>
                </button>
              ))}
            </div>
          </section>

          {/* Search */}
          <section className="space-y-3">
            <label className="text-sm font-medium" style={{ color: 'hsl(220 10% 70%)' }}>Search templates</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'hsl(220 10% 35%)' }} />
              <Input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-9 text-sm"
                style={{
                  background: 'hsl(240 8% 9%)',
                  borderColor: 'hsl(240 6% 18%)',
                  color: 'hsl(220 10% 85%)',
                }}
                placeholder="Search by name, type, or category..."
              />
            </div>

            {searchQuery.trim() && (
              <div
                className="max-h-56 space-y-2 overflow-y-auto rounded-lg p-2"
                style={{
                  background: 'hsl(240 8% 8%)',
                  border: '1px solid hsl(240 6% 16%)',
                }}
              >
                {filteredTemplates.length > 0 ? (
                  filteredTemplates.map((template) => (
                    <TemplateButton key={template.id} template={template} onSelect={handleTemplateSelect} />
                  ))
                ) : (
                  <div
                    className="rounded-lg px-3 py-6 text-center text-xs"
                    style={{
                      border: '1px dashed hsl(240 6% 20%)',
                      color: 'hsl(220 10% 40%)',
                    }}
                  >
                    No templates matched &ldquo;{searchQuery}&rdquo;
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Template categories */}
          <section className="space-y-3">
            <div className="text-sm font-medium" style={{ color: 'hsl(220 10% 70%)' }}>Template categories</div>
            {(['sender', 'receiver', 'plugin'] as NodeType[]).map((type) => {
              const accentMap: Record<string, string> = { sender: '#00d4ff', receiver: '#34d399', plugin: '#fbbf24' };
              const accent = accentMap[type];
              return (
                <Collapsible
                  key={type}
                  open={openSections[type]}
                  onOpenChange={(isOpen) => setOpenSections((current) => ({ ...current, [type]: isOpen }))}
                >
                  <div
                    className="rounded-xl overflow-hidden"
                    style={{
                      border: `1px solid ${accent}15`,
                      background: `${accent}05`,
                    }}
                  >
                    <CollapsibleTrigger
                      className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-medium transition-colors"
                      style={{ color: 'hsl(220 10% 80%)' }}
                    >
                      <span className="capitalize flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: accent }} />
                        {type}s
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${openSections[type] ? 'rotate-180' : ''}`}
                        style={{ color: 'hsl(220 10% 40%)' }}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 p-3" style={{ borderTop: `1px solid ${accent}10` }}>
                      {templatesByType[type].map((template) => (
                        <TemplateButton key={template.id} template={template} onSelect={handleTemplateSelect} />
                      ))}
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </section>

          {/* Deploy section */}
          <section
            className="space-y-3 rounded-xl p-4"
            style={{
              background: 'hsl(240 8% 9%)',
              border: '1px solid hsl(240 6% 16%)',
            }}
          >
            <div className="text-sm font-medium" style={{ color: 'hsl(220 10% 80%)' }}>Deploy</div>
            <p className="text-[11px]" style={{ color: 'hsl(220 10% 40%)' }}>
              Validate against backend rules, then deploy when ready.
            </p>
            <Button
              variant="outline"
              onClick={onValidateWithBackend}
              disabled={isValidating || isDeploying}
              className="w-full justify-center gap-2 text-sm"
              style={{
                background: 'transparent',
                borderColor: 'hsl(240 6% 20%)',
                color: 'hsl(220 10% 70%)',
              }}
            >
              <Shield className="h-3.5 w-3.5" />
              {isValidating ? 'Validating...' : 'Validate'}
            </Button>
            <button
              onClick={onDeploy}
              disabled={!canDeploy || isDeploying || isValidating}
              className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: canDeploy ? 'linear-gradient(135deg, #00d4ff, #0077ff)' : 'hsl(240 6% 14%)',
                color: canDeploy ? '#fff' : 'hsl(220 10% 40%)',
                boxShadow: canDeploy ? '0 4px 16px rgba(0, 212, 255, 0.2)' : 'none',
              }}
            >
              <Rocket className="h-3.5 w-3.5" />
              {isDeploying ? 'Deploying...' : canDeploy ? 'Deploy Workflow' : 'Resolve blockers first'}
            </button>
            <Button
              variant="outline"
              onClick={onCleanWorkflow}
              disabled={isCleaning || isDeploying || isValidating}
              className="w-full justify-center gap-2 text-sm"
              style={{
                background: 'transparent',
                borderColor: 'hsl(240 6% 20%)',
                color: 'hsl(220 10% 70%)',
              }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {isCleaning ? 'Cleaning...' : 'Clean Layout'}
            </Button>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
