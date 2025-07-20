'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { NodeType } from '../../lib/types';
import { Send, Inbox, Puzzle } from 'lucide-react';

const nodeTypesPalette = [
  { type: 'sender', label: 'Sender', color: 'bg-blue-100', shape: 'rounded-lg', text: 'text-blue-700', icon: <Send className="inline-block mr-1 h-4 w-4 text-blue-600" /> },
  { type: 'receiver', label: 'Receiver', color: 'bg-green-100', shape: 'rounded-lg', text: 'text-green-700', icon: <Inbox className="inline-block mr-1 h-4 w-4 text-green-600" /> },
  { type: 'plugin', label: 'Plugin', color: 'bg-purple-100', shape: 'rounded-lg', text: 'text-purple-700', icon: <Puzzle className="inline-block mr-1 h-4 w-4 text-purple-600" /> },
];

interface CanvasPanelProps {
  onAddNode: (type: NodeType) => void;
  isSheetOpen: boolean;
  setIsSheetOpen: (isOpen: boolean) => void;
  onDeploy: () => void;
  isDeploying: boolean;
}

export default function CanvasPanel({ onAddNode, isSheetOpen, setIsSheetOpen, onDeploy, isDeploying }: CanvasPanelProps) {
  return (
    <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen} modal={false}>
      <SheetTrigger asChild>
        <Button 
          variant="outline" 
          className="absolute top-4 left-4 z-10"
          onClick={() => setIsSheetOpen(!isSheetOpen)} // Toggle state
        >
          {isSheetOpen ? 'Hide Controls' : 'Show Controls'}
        </Button>
      </SheetTrigger>
      <SheetContent 
        side="left" 
        className="w-[300px] sm:w-[350px]"
        onInteractOutside={(e) => { e.preventDefault(); }}
        onEscapeKeyDown={(e) => { e.preventDefault(); }}
      >
        <SheetHeader>
          <SheetTitle>Node Controls</SheetTitle>
          <SheetDescription>
            Manage your nodes and canvas settings here.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 py-4">
          <div className="flex gap-2 mb-2">
            {nodeTypesPalette.map(nt => (
              <button
                key={nt.type}
                className={`px-3 py-2 ${nt.color} ${nt.shape} ${nt.text} shadow border font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400 flex items-center gap-1`}
                onClick={() => onAddNode(nt.type as NodeType)}
                title={`Add ${nt.label} Node`}
              >
                {nt.icon}
                {nt.label}
              </button>
            ))}
          </div>
          <div className="text-xs text-gray-500 mb-2 flex items-center gap-3">
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

// CrossIcon component removed as it's no longer used 