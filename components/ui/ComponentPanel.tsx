'use client';

import { useState, useEffect, ChangeEvent } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Node } from '@xyflow/react';
import type { EditableNodeData } from '@/lib/types';
import SecureTokenDisplay from './SecureTokenDisplay';

interface ComponentPanelProps {
  selectedNode: Node<EditableNodeData> | null;
  onNodeDataChange: (nodeId: string, newData: Partial<EditableNodeData>) => void;
  isOpen: boolean;
  onClearSelection: () => void;
}

export default function ComponentPanel({
  selectedNode,
  onNodeDataChange,
  isOpen,
  onClearSelection,
}: ComponentPanelProps) {
  const [formData, setFormData] = useState<Partial<EditableNodeData>>({});

  useEffect(() => {
    if (selectedNode?.data) {
      const currentAccessTypes = selectedNode.data.access_types || {};
      setFormData({
        name: selectedNode.data.name,
        token: selectedNode.data.token,
        access_types: {
          canSend: currentAccessTypes.canSend === undefined ? true : currentAccessTypes.canSend,
          canReceive: currentAccessTypes.canReceive === undefined ? true : currentAccessTypes.canReceive,
          allowedSendTypes: currentAccessTypes.allowedSendTypes || [],
          allowedReceiveTypes: currentAccessTypes.allowedReceiveTypes || [],
        },
      });
    } else {
      setFormData({});
    }
  }, [selectedNode]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = event.target;
    const checked = (event.target as HTMLInputElement).checked;

    setFormData((prev) => {
      if (!prev) return {};

      const updatedData = { ...prev };

      if (name === "name") {
        updatedData[name] = value;
      } else if (name === "canSend" || name === "canReceive") {
        updatedData.access_types = {
          ...(updatedData.access_types || {}),
          [name]: type === 'checkbox' ? checked : value,
        };
      } else if (name === "allowedSendTypes" || name === "allowedReceiveTypes") {
        updatedData.access_types = {
          ...(updatedData.access_types || {}),
          [name]: value.split(',').map(s => s.trim()).filter(s => s),
        };
      }
      return updatedData;
    });
  };

  const handleSubmit = () => {
    if (selectedNode && onNodeDataChange && formData) {
      const dataToSubmit: Partial<EditableNodeData> = {
        ...formData,
        access_types: {
          canSend: formData.access_types?.canSend === undefined ? true : formData.access_types.canSend,
          canReceive: formData.access_types?.canReceive === undefined ? true : formData.access_types.canReceive,
          allowedSendTypes: formData.access_types?.allowedSendTypes || [],
          allowedReceiveTypes: formData.access_types?.allowedReceiveTypes || [],
        },
      };
      onNodeDataChange(selectedNode.id, dataToSubmit);
    }
  };

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(sheetWantsToChangeToState) => {
        if (!sheetWantsToChangeToState && isOpen) {
          onClearSelection();
        }
      }}
      modal={false}
    >
      <SheetContent
        side="right"
        className="w-[300px] sm:w-[350px] no-close-button border-none focus:ring-0 focus:ring-offset-0 focus-visible:outline-none"
        onInteractOutside={(e) => {
          if (isOpen) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => {
          if (isOpen) {
            e.preventDefault();
          }
        }}
      >
        {isOpen && selectedNode && (
          <>
            <SheetHeader>
              <SheetTitle>Edit Node (ID: {selectedNode.id})</SheetTitle>
              <SheetDescription>
                Modify the properties of the selected node.
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-2">
          <div className="font-semibold text-gray-700">name: (ID: {selectedNode.id})</div>
          <input 
            type="text"
            name="name"
            value={formData.name || ''}
            onChange={handleInputChange}
            className="p-1 border border-gray-300 rounded-md text-sm w-full"
            placeholder="Enter name"
          />
          <SecureTokenDisplay token={formData.token} label="Token:" />
          <div className="font-semibold text-gray-700 mt-2">Access Types:</div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`canSend-${selectedNode.id}`}
              name="canSend"
              checked={formData.access_types?.canSend === undefined ? true : formData.access_types.canSend}
              onChange={handleInputChange}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor={`canSend-${selectedNode.id}`} className="text-sm text-gray-700">Can Send</label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`canReceive-${selectedNode.id}`}
              name="canReceive"
              checked={formData.access_types?.canReceive === undefined ? true : formData.access_types.canReceive}
              onChange={handleInputChange}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor={`canReceive-${selectedNode.id}`} className="text-sm text-gray-700">Can Receive</label>
          </div>
          <div className="font-semibold text-gray-700 mt-1">Allowed Send Types:</div>
          <input
            type="text"
            name="allowedSendTypes"
            value={(formData.access_types?.allowedSendTypes || []).join(', ')}
            onChange={handleInputChange}
            className="p-1 border border-gray-300 rounded-md text-sm w-full"
            placeholder="e.g., typeA, typeB"
          />
          <div className="font-semibold text-gray-700 mt-1">Allowed Receive Types:</div>
          <input
            type="text"
            name="allowedReceiveTypes"
            value={(formData.access_types?.allowedReceiveTypes || []).join(', ')}
            onChange={handleInputChange}
            className="p-1 border border-gray-300 rounded-md text-sm w-full"
            placeholder="e.g., typeX, typeY"
          />
              <Button onClick={handleSubmit} className="w-full mt-2">
                Apply Changes
              </Button>
            </div>
          </>
        )}
        {isOpen && !selectedNode && (
          <SheetHeader>
            <SheetTitle>No Node Selected</SheetTitle>
            <SheetDescription>
              Click a node on the canvas to see its properties.
            </SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  );
} 