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
}

export default function CanvasPanel({ onAddNode, isSheetOpen, setIsSheetOpen }: CanvasPanelProps) {
  

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
        </div>
      </SheetContent>
    </Sheet>
  );
}

// CrossIcon component removed as it's no longer used 