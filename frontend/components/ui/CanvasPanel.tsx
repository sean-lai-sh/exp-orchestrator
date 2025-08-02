'use client';

import { useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { NodeType, NodeTemplate } from '../../lib/types';
import { nodeTemplates, templatesByType } from '../../lib/nodeTemplates';
import { Send, Inbox, Puzzle, ChevronDown, Plus, Search } from 'lucide-react';

const nodeTypesPalette = [
  { type: 'sender', label: 'Sender', color: 'bg-blue-100', shape: 'rounded-lg', text: 'text-blue-700', icon: <Send className="inline-block mr-1 h-4 w-4 text-blue-600" /> },
  { type: 'receiver', label: 'Receiver', color: 'bg-green-100', shape: 'rounded-lg', text: 'text-green-700', icon: <Inbox className="inline-block mr-1 h-4 w-4 text-green-600" /> },
  { type: 'plugin', label: 'Plugin', color: 'bg-purple-100', shape: 'rounded-lg', text: 'text-purple-700', icon: <Puzzle className="inline-block mr-1 h-4 w-4 text-purple-600" /> },
];

interface CanvasPanelProps {
  onAddNode: (type: NodeType, template?: NodeTemplate) => void;
  isSheetOpen: boolean;
  setIsSheetOpen: (isOpen: boolean) => void;
  onDeploy: () => void;
  isDeploying: boolean;
}

export default function CanvasPanel({ onAddNode, isSheetOpen, setIsSheetOpen, onDeploy, isDeploying }: CanvasPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const handleTemplateSelect = (template: NodeTemplate) => {
    onAddNode(template.type, template);
    setSearchQuery('');
    setIsSearchOpen(false);
  };

  // Filter templates based on search query
  const filteredTemplates = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return nodeTemplates.filter((template: NodeTemplate) => 
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.type.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  const renderTemplateDropdown = (type: NodeType, icon: React.ReactNode, label: string, bgColor: string) => {
    const templates = templatesByType[type] || [];
    
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="outline" 
            className={`flex-1 justify-between ${bgColor} border-0 shadow-sm`}
            size="sm"
          >
            <span className="flex items-center gap-1 text-xs">
              {icon}
              {label}
            </span>
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64" align="start">
          <DropdownMenuLabel className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {label} Templates
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {templates.map((template) => (
            <DropdownMenuItem
              key={template.id}
              onClick={() => handleTemplateSelect(template)}
              className="flex flex-col items-start gap-1 p-3 cursor-pointer hover:bg-gray-50"
            >
              <div className="flex items-center gap-2 w-full">
                {icon}
                <span className="font-medium text-sm">{template.name}</span>
              </div>
              <p className="text-xs text-gray-500 leading-tight">{template.description}</p>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };
          

  return (
    <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen} modal={false}>
      <SheetTrigger asChild>
        <Button 
          variant="outline" 
          className="absolute top-4 left-4 z-10"
          onClick={() => setIsSheetOpen(!isSheetOpen)}
        >
          {isSheetOpen ? 'Hide Controls' : 'Show Controls'}
        </Button>
      </SheetTrigger>
      <SheetContent 
        side="left" 
        className="w-[320px] sm:w-[380px]"
        onInteractOutside={(e) => { e.preventDefault(); }}
        onEscapeKeyDown={(e) => { e.preventDefault(); }}
      >
        <SheetHeader>
          <SheetTitle>Node Controls</SheetTitle>
          <SheetDescription>
            Create and manage nodes on your canvas.
          </SheetDescription>
        </SheetHeader>
        
        <div className="grid gap-4 py-4">
          {/* Quick Add Buttons */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Quick Add</label>
            <div className="flex gap-2">
              {nodeTypesPalette.map(nt => (
                <button
                  key={nt.type}
                  className={`px-3 py-2 ${nt.color} ${nt.shape} ${nt.text} shadow border font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400 flex items-center gap-1 text-xs`}
                  onClick={() => onAddNode(nt.type as NodeType)}
                  title={`Add ${nt.label} Node`}
                >
                  {nt.icon}
                  {nt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Template Dropdowns by Type */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-700">Templates by Type</label>
            
            <div className="space-y-2">
              {renderTemplateDropdown(
                'sender', 
                <Send className="h-4 w-4 text-blue-600" />, 
                'Sender Templates', 
                'bg-blue-50 hover:bg-blue-100'
              )}
              
              {renderTemplateDropdown(
                'receiver', 
                <Inbox className="h-4 w-4 text-green-600" />, 
                'Receiver Templates', 
                'bg-green-50 hover:bg-green-100'
              )}
              
              {renderTemplateDropdown(
                'plugin', 
                <Puzzle className="h-4 w-4 text-purple-600" />, 
                'Plugin Templates', 
                'bg-purple-50 hover:bg-purple-100'
              )}
            </div>
          </div>

          {/* Search Templates */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Search Templates</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search for templates..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchOpen(e.target.value.length > 0);
                }}
                className="pl-10"
              />
              
              {/* Search Results Dropdown */}
              {isSearchOpen && filteredTemplates.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-64 overflow-y-auto">
                  {filteredTemplates.map((template) => (
                    <div
                      key={template.id}
                      onClick={() => handleTemplateSelect(template)}
                      className="flex flex-col gap-1 p-3 cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        {template.type === 'sender' && <Send className="h-4 w-4 text-blue-600" />}
                        {template.type === 'receiver' && <Inbox className="h-4 w-4 text-green-600" />}
                        {template.type === 'plugin' && <Puzzle className="h-4 w-4 text-purple-600" />}
                        <span className="font-medium text-sm">{template.name}</span>
                        <span className="text-xs text-gray-400 capitalize">({template.type})</span>
                      </div>
                      <p className="text-xs text-gray-500 leading-tight">{template.description}</p>
                    </div>
                  ))}
                </div>
              )}
              
              {isSearchOpen && searchQuery && filteredTemplates.length === 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 p-3">
                  <p className="text-xs text-gray-400">No templates found matching "{searchQuery}"</p>
                </div>
              )}
            </div>
          </div>

          <DropdownMenuSeparator />

          <Button
            variant={isDeploying ? "default" : "secondary"}
            onClick={onDeploy}
            disabled={isDeploying}
            className={isDeploying ? "relative bg-blue-600 text-white animate-pulse" : ""}
          >
            {isDeploying && (
              <svg className="animate-spin h-4 w-4 mr-2 inline-block text-white" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 818-8v4a4 4 0 00-4 4H4z" />
              </svg>
            )}
            {isDeploying ? 'Deploying...' : 'Deploy'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
} 