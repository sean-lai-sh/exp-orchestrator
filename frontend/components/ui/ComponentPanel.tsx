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
import { toast } from 'sonner';
import { Info, ChevronDown, ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';

function generateToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 36; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

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
  const [showConfirm, setShowConfirm] = useState(false);
  
  // Collapsible section states
  const [basePropsOpen, setBasePropsOpen] = useState(true);
  const [customPropsOpen, setCustomPropsOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (selectedNode?.data) {
      setFormData({ ...selectedNode.data });
    } else {
      setFormData({});
    }
  }, [selectedNode]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Editable sources list for sender/receiver
  const handleSourceChange = (idx: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      sources: (prev.sources || []).map((src: string, i: number) => (i === idx ? value : src)),
    }));
  };
  const handleAddSource = () => {
    setFormData((prev) => ({
      ...prev,
      sources: [...(prev.sources || []), ''],
    }));
  };
  const handleRemoveSource = (idx: number) => {
    setFormData((prev) => ({
      ...prev,
      sources: (prev.sources || []).filter((_: string, i: number) => i !== idx),
    }));
  };

  const handleSubmit = () => {
    if (selectedNode && onNodeDataChange && formData) {
      onNodeDataChange(selectedNode.id, formData);
    }
  };

  const handleRegenerateToken = () => {
    setShowConfirm(true);
  };
  const confirmRegenerateToken = () => {
    setFormData(prev => ({ ...prev, token: generateToken() }));
    setShowConfirm(false);
    toast.success('Token regenerated!');
  };

  if (!selectedNode) {
    return (
      <Sheet open={isOpen} onOpenChange={onClearSelection} modal={false}>
        <SheetContent side="right" className="w-[300px] sm:w-[400px] no-close-button border-none">
          <SheetHeader>
            <SheetTitle>No Node Selected</SheetTitle>
            <SheetDescription>
              Click a node on the canvas to see its properties.
            </SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    );
  }

  const nodeType = selectedNode.data.nodeType;

  return (
    <Sheet open={isOpen} onOpenChange={onClearSelection} modal={false}>
      <SheetContent side="right" className="w-[300px] sm:w-[400px] no-close-button border-none">
        <SheetHeader>
          <SheetTitle>Edit Node (ID: {selectedNode?.id})</SheetTitle>
          <SheetDescription>
            Modify the properties of the selected node.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-2">
          {/* Name is always editable */}
          <div className="font-semibold text-gray-700">Name:</div>
          <input
            type="text"
            name="name"
            value={formData.name || ''}
            onChange={handleInputChange}
            className="p-1 border border-gray-300 rounded-md text-sm w-full"
            placeholder="Enter name"
          />

          {/* Sender/Receiver: Editable sources list */}
          {(nodeType === 'sender' || nodeType === 'receiver') && (
            <>
              <div className="font-semibold text-gray-700 mt-2">Sources:</div>
              <div className="flex flex-col gap-1">
                {(formData.sources || []).map((src: string, idx: number) => (
                  <div key={idx} className="flex gap-1 items-center">
                    <input
                      type="text"
                      value={src}
                      onChange={e => handleSourceChange(idx, e.target.value)}
                      className="p-1 border border-gray-300 rounded-md text-sm flex-1"
                      placeholder={`Source ${idx + 1}`}
                    />
                    <button
                      type="button"
                      className="text-xs text-red-500 px-2 py-1 hover:underline"
                      onClick={() => handleRemoveSource(idx)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="text-xs text-blue-600 px-2 py-1 hover:underline mt-1"
                  onClick={handleAddSource}
                >
                  + Add Source
                </button>
              </div>
            </>
          )}

          {/* Always show token with info tooltip */}
          <div className="flex items-center gap-1 mt-2">
            <span className="font-semibold text-gray-700">Auth Token:</span>
            <span className="relative group">
              <Info className="h-4 w-4 text-gray-400 cursor-pointer" />
              <span className="absolute left-6 top-1/2 -translate-y-1/2 bg-gray-800 text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition pointer-events-none z-10 whitespace-nowrap">
                This is your node’s secure access key. It is used to authenticate connections.
              </span>
            </span>
          </div>
          <SecureTokenDisplay token={formData.token} />

          {/* Plugin: Description, Token, Access Types */}
          {nodeType === 'plugin' && (
            <>
              <div className="font-semibold text-gray-700 mt-2">Description:</div>
              <textarea
                name="description"
                value={formData.description || ''}
                onChange={handleInputChange}
                className="p-1 border border-gray-300 rounded-md text-sm w-full h-20 resize-none"
                rows={3}
                placeholder="Enter description"
              />
              <div className="font-semibold text-gray-700 mt-2">Access Types:</div>
              {/* ...access_types fields as before... */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`canSend-${selectedNode.id}`}
                  name="canSend"
                  checked={formData.access_types?.canSend === undefined ? true : formData.access_types.canSend}
                  onChange={e => setFormData(prev => ({
                    ...prev,
                    access_types: {
                      ...prev.access_types,
                      canSend: e.target.checked,
                    },
                  }))}
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
                  onChange={e => setFormData(prev => ({
                    ...prev,
                    access_types: {
                      ...prev.access_types,
                      canReceive: e.target.checked,
                    },
                  }))}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor={`canReceive-${selectedNode.id}`} className="text-sm text-gray-700">Can Receive</label>
              </div>
              <div className="font-semibold text-gray-700 mt-1">Allowed Send Types:</div>
              <input
                type="text"
                name="allowedSendTypes"
                value={(formData.access_types?.allowedSendTypes || []).join(', ')}
                onChange={e => setFormData(prev => ({
                  ...prev,
                  access_types: {
                    ...prev.access_types,
                    allowedSendTypes: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                  },
                }))}
                className="p-1 border border-gray-300 rounded-md text-sm w-full"
                placeholder="e.g., typeA, typeB"
              />
              <div className="font-semibold text-gray-700 mt-1">Allowed Receive Types:</div>
              <input
                type="text"
                name="allowedReceiveTypes"
                value={(formData.access_types?.allowedReceiveTypes || []).join(', ')}
                onChange={e => setFormData(prev => ({
                  ...prev,
                  access_types: {
                    ...prev.access_types,
                    allowedReceiveTypes: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                  },
                }))}
                className="p-1 border border-gray-300 rounded-md text-sm w-full"
                placeholder="e.g., typeX, typeY"
              />
            </>
          )}

          {/* Advanced section */}
          <Collapsible className="mt-4">
            <CollapsibleTrigger className="text-xs text-gray-600 underline flex items-center gap-1">
              Advanced
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 border-t pt-2">
                <button
                  type="button"
                  className="text-xs text-red-600 underline"
                  onClick={handleRegenerateToken}
                >
                  Regenerate Token
                </button>
                {showConfirm && (
                  <div className="mt-2 bg-yellow-50 border border-yellow-300 rounded p-2 text-xs">
                    <div className="mb-2 font-semibold text-yellow-800">Regenerate token?</div>
                    <div className="mb-2 text-yellow-700">Regenerating this token will break existing connections. Are you sure?</div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="px-2 py-1 bg-red-600 text-white rounded text-xs"
                        onClick={confirmRegenerateToken}
                      >
                        Yes, Regenerate
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs"
                        onClick={() => setShowConfirm(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          <button
            onClick={handleSubmit}
            className="w-full mt-2 bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
          >
            Apply Changes
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
} 