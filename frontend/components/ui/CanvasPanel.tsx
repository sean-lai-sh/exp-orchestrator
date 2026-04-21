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
import { ChevronDown, Inbox, Keyboard, Puzzle, Search, Send, Sparkles } from 'lucide-react';

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
  className: string;
}> = [
  {
    type: 'sender',
    label: 'Sender',
    shortcut: 'S',
    description: 'Create source nodes that emit data into the DAG.',
    icon: <Send className="h-4 w-4 text-blue-600" />,
    className: 'border-blue-200 bg-blue-50 hover:bg-blue-100',
  },
  {
    type: 'receiver',
    label: 'Receiver',
    shortcut: 'R',
    description: 'Create terminal nodes that consume workflow outputs.',
    icon: <Inbox className="h-4 w-4 text-emerald-600" />,
    className: 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100',
  },
  {
    type: 'plugin',
    label: 'Plugin',
    shortcut: 'P',
    description: 'Create processing steps that transform or route data.',
    icon: <Puzzle className="h-4 w-4 text-violet-600" />,
    className: 'border-violet-200 bg-violet-50 hover:bg-violet-100',
  },
];

function TemplateButton({
  template,
  onSelect,
}: {
  template: NodeTemplate;
  onSelect: (template: NodeTemplate) => void;
}) {
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
      className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300 hover:shadow-sm"
      title="Click to add at center or drag onto the canvas"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-900">{template.name}</span>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
          {template.type}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-600">{template.description}</p>
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
    if (!query) {
      return [];
    }

    return nodeTemplates.filter((template) => {
      return [template.name, template.description, template.type, template.category]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
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
        <Button variant="outline" className="absolute left-4 top-4 z-20" onClick={() => setIsSheetOpen(!isSheetOpen)}>
          {isSheetOpen ? 'Hide Controls' : 'Show Controls'}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="left"
        className="w-[340px] overflow-y-auto sm:w-[400px]"
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle>Workflow Editor</SheetTitle>
          <SheetDescription>
            Use a single maintained editor path for node creation, inspection, validation, and deploy preparation.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
              <Keyboard className="h-4 w-4 text-slate-500" />
              Keyboard shortcuts
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-slate-600">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">S = Sender</div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">R = Receiver</div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">P = Plugin</div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center col-span-3">Delete / Backspace = Remove selected node</div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-sm font-medium text-slate-900">Quick add or drag onto canvas</div>
            <div className="grid gap-2">
              {quickAddPalette.map((entry) => (
                <button
                  key={entry.type}
                  type="button"
                  draggable
                  onDragStart={(event) => handleQuickAddDragStart(event, entry.type)}
                  onClick={() => onAddNode(entry.type)}
                  className={`rounded-xl border p-3 text-left transition ${entry.className}`}
                  title="Click to add at center or drag onto the canvas"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      {entry.icon}
                      {entry.label}
                    </span>
                    <span className="rounded bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {entry.shortcut}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{entry.description}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <label className="text-sm font-medium text-slate-900">Search templates</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-9"
                placeholder="Search by node name, type, or category"
              />
            </div>

            {searchQuery.trim() && (
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
                {filteredTemplates.length > 0 ? (
                  filteredTemplates.map((template) => (
                    <TemplateButton key={template.id} template={template} onSelect={handleTemplateSelect} />
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-6 text-center text-xs text-slate-500">
                    No templates matched “{searchQuery}”.
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="text-sm font-medium text-slate-900">Template categories</div>
            {(['sender', 'receiver', 'plugin'] as NodeType[]).map((type) => (
              <Collapsible
                key={type}
                open={openSections[type]}
                onOpenChange={(isOpen) => setOpenSections((current) => ({ ...current, [type]: isOpen }))}
              >
                <div className="rounded-xl border border-slate-200 bg-slate-50">
                  <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-medium text-slate-900">
                    <span className="capitalize">{type}s</span>
                    <ChevronDown className={`h-4 w-4 text-slate-500 transition ${openSections[type] ? 'rotate-180' : ''}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-2 border-t border-slate-200 p-3">
                    {templatesByType[type].map((template) => (
                      <TemplateButton key={template.id} template={template} onSelect={handleTemplateSelect} />
                    ))}
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </section>

          <section className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-sm font-medium text-slate-900">Deploy preparation</div>
            <p className="text-xs text-slate-600">
              Run the analyzer continuously, validate against backend rules on demand, and only deploy when blockers are cleared.
            </p>
            <Button variant="outline" onClick={onValidateWithBackend} disabled={isValidating || isDeploying} className="w-full">
              {isValidating ? 'Validating…' : 'Validate with Backend'}
            </Button>
            <Button onClick={onDeploy} disabled={!canDeploy || isDeploying || isValidating} className="w-full">
              {isDeploying ? 'Deploying…' : canDeploy ? 'Deploy Workflow' : 'Resolve blockers before deploy'}
            </Button>
            <Button
              variant="outline"
              onClick={onCleanWorkflow}
              disabled={isCleaning || isDeploying || isValidating}
              className="w-full"
            >
              {!isCleaning && <Sparkles className="mr-2 h-4 w-4" />}
              {isCleaning ? 'Cleaning…' : 'Clean Workflow Layout'}
            </Button>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
