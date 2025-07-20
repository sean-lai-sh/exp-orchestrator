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

interface CanvasPanelProps {
  onAddNode: () => void;
  isSheetOpen: boolean;
  setIsSheetOpen: (isOpen: boolean) => void;
  onDeploy: () => void;
  isDeploying: boolean; // New prop
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
          {isSheetOpen ? 'Hide Controls' : 'Show Controls'} {/* Reverted button text */}
        </Button>
      </SheetTrigger>
      <SheetContent 
        side="left" 
        className="w-[300px] sm:w-[350px]"
        onInteractOutside={(e) => { // Prevent closing on outside interaction
          e.preventDefault();
        }}
        onEscapeKeyDown={(e) => { // Prevent closing on Escape key
            e.preventDefault();
        }}
      >
        <SheetHeader>
          <SheetTitle>Node Controls</SheetTitle>
          <SheetDescription>
            Manage your nodes and canvas settings here.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 py-4">
          <Button
            onClick={() => {
              onAddNode();
            }}
          >
            Add Editable Node
          </Button>
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