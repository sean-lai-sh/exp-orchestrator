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

  const handleTemplateSelect = (template: NodeTemplate) => {
    onAddNode(template.type, template);
    setSearchQuery('');
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
            className={`flex-1 justify-between ${bgColor} border-0 shadow-sm hover:shadow-md transition-shadow`}
            size="sm"
          >
            <span className="flex items-center gap-1 text-xs">
              {icon}
              {label}
            </span>
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-72" align="start">
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
          {templates.length === 0 && (
            <DropdownMenuItem disabled className="text-xs text-gray-400">
              No templates available
            </DropdownMenuItem>
          )}
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
            Create and manage nodes in your workflow.
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
                  className={`px-3 py-2 ${nt.color} ${nt.shape} ${nt.text} shadow border font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400 flex items-center gap-1 flex-1 justify-center text-xs`}
                  onClick={() => onAddNode(nt.type as NodeType)}
                  title={`Add Basic ${nt.label}`}
                >
                  {nt.icon}
                  {nt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Template Search */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Search Templates</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search all templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            {/* Search Results */}
            {searchQuery.trim() && (
              <div className="max-h-48 overflow-y-auto border rounded-md bg-white">
                {filteredTemplates.length > 0 ? (
                  filteredTemplates.map((template) => (
                    <div
                      key={template.id}
                      onClick={() => handleTemplateSelect(template)}
                      className="flex flex-col gap-1 p-3 cursor-pointer hover:bg-gray-50 border-b last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        {template.type === 'sender' && <Send className="h-4 w-4 text-blue-600" />}
                        {template.type === 'receiver' && <Inbox className="h-4 w-4 text-green-600" />}
                        {template.type === 'plugin' && <Puzzle className="h-4 w-4 text-purple-600" />}
                        <span className="font-medium text-sm">{template.name}</span>
                        <span className="text-xs text-gray-400 capitalize bg-gray-100 px-1 rounded">
                          {template.type}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{template.description}</p>
                    </div>
                  ))
                ) : (
                  <div className="p-3 text-xs text-gray-400 text-center">
                    No templates found matching "{searchQuery}"
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Separate Template Dropdowns */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Template Categories</label>
            <div className="grid gap-2">
              {renderTemplateDropdown(
                'sender', 
                <Send className="h-3 w-3 text-blue-600" />, 
                'Senders',
                'bg-blue-50 hover:bg-blue-100'
              )}
              {renderTemplateDropdown(
                'receiver', 
                <Inbox className="h-3 w-3 text-green-600" />, 
                'Receivers',
                'bg-green-50 hover:bg-green-100'
              )}
              {renderTemplateDropdown(
                'plugin', 
                <Puzzle className="h-3 w-3 text-purple-600" />, 
                'Plugins',
                'bg-purple-50 hover:bg-purple-100'
              )}
            </div>
          </div>

          <div className="text-xs text-gray-500 mb-2 flex items-center gap-3 justify-center">
            <span className="inline-flex items-center"><Send className="h-3 w-3 text-blue-600 mr-1" /> Sender</span>
            <span className="inline-flex items-center"><Inbox className="h-3 w-3 text-green-600 mr-1" /> Receiver</span>
            <span className="inline-flex items-center"><Puzzle className="h-3 w-3 text-purple-600 mr-1" /> Plugin</span>
          </div>
          
          <Button
            variant={isDeploying ? "default" : "secondary"}
            onClick={onDeploy}
            disabled={isDeploying}
            className={isDeploying ? "relative bg-blue-600 text-white animate-pulse" : ""}
          >
            {isDeploying && (
              <svg className="animate-spin h-4 w-4 mr-2 inline-block text-white" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            )}
            {isDeploying ? 'Deploying...' : 'Deploy'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
