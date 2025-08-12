'use client';

import { useState, useEffect, ChangeEvent, useCallback } from 'react';
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
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import type { Node } from '@xyflow/react';
import type { EditableNodeData } from '@/lib/types';
import SecureTokenDisplay from './SecureTokenDisplay';
import { toast } from 'sonner';
import { Info, ChevronDown, ChevronRight, Settings, User, Wrench } from 'lucide-react';
import { getSourceColors } from '@/lib/sourceColors';

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
  const [advancedChanges, setAdvancedChanges] = useState<Partial<EditableNodeData>>({});
  
  // Collapsible section states
  const [basePropsOpen, setBasePropsOpen] = useState(true);
  const [customPropsOpen, setCustomPropsOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Auto-apply non-advanced changes
  const autoApplyChanges = useCallback((newData: Partial<EditableNodeData>) => {
    if (selectedNode && onNodeDataChange) {
      onNodeDataChange(selectedNode.id, newData);
    }
  }, [selectedNode, onNodeDataChange]);

  useEffect(() => {
    if (selectedNode?.data) {
      setFormData({ ...selectedNode.data });
      setAdvancedChanges({});
    } else {
      setFormData({});
      setAdvancedChanges({});
    }
  }, [selectedNode]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>, isAdvanced = false) => {
    const { name, value } = event.target;
    const newData = { [name]: value };
    
    setFormData((prev) => ({ ...prev, ...newData }));
    
    if (isAdvanced) {
      setAdvancedChanges(prev => ({ ...prev, ...newData }));
    } else {
      // Auto-apply non-advanced changes
      autoApplyChanges(newData);
    }
  };

  // Editable sources list for all node types
  const handleSourceChange = (idx: number, value: string) => {
    const newSources = (formData.sources || []).map((src: string, i: number) => (i === idx ? value : src));
    const newData = { sources: newSources };
    
    setFormData((prev) => ({ ...prev, ...newData }));
    autoApplyChanges(newData);
  };
  
  const handleAddSource = () => {
    const newSources = [...(formData.sources || []), ''];
    const newData = { sources: newSources };
    
    setFormData((prev) => ({ ...prev, ...newData }));
    autoApplyChanges(newData);
  };
  
  const handleRemoveSource = (idx: number) => {
    const newSources = (formData.sources || []).filter((_: string, i: number) => i !== idx);
    const newData = { sources: newSources };
    
    setFormData((prev) => ({ ...prev, ...newData }));
    autoApplyChanges(newData);
  };

  const handleAccessTypeChange = (field: string, value: any) => {
    const newData = {
      access_types: {
        ...formData.access_types,
        [field]: value,
      },
    };
    
    setFormData((prev) => ({ ...prev, ...newData }));
    autoApplyChanges(newData);
  };

  const handleSubmit = () => {
    if (selectedNode && onNodeDataChange && Object.keys(advancedChanges).length > 0) {
      onNodeDataChange(selectedNode.id, advancedChanges);
      setAdvancedChanges({});
      toast.success('Advanced settings applied!');
    }
  };

  const handleRegenerateToken = () => {
    setShowConfirm(true);
  };
  
  const confirmRegenerateToken = () => {
    const newToken = generateToken();
    setFormData(prev => ({ ...prev, token: newToken }));
    setAdvancedChanges(prev => ({ ...prev, token: newToken }));
    setShowConfirm(false);
    toast.success('Token regenerated!');
  };

  // Get all custom properties (non-standard fields)
  const getCustomProperties = () => {
    if (!formData) return {};
    const standardFields = ['name', 'description', 'token', 'access_types', 'nodeType', 'sources'];
    return Object.keys(formData).reduce((acc, key) => {
      if (!standardFields.includes(key)) {
        acc[key] = formData[key as keyof EditableNodeData];
      }
      return acc;
    }, {} as Record<string, any>);
  };

  const customProps = getCustomProperties();

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
      <SheetContent side="right" className="w-[300px] sm:w-[400px] no-close-button border-none overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Edit Node (ID: {selectedNode?.id})
          </SheetTitle>
          <SheetDescription>
            Modify the properties of your {nodeType} node.
          </SheetDescription>
        </SheetHeader>
        
        <div className="flex flex-col gap-4 mt-4">
          {/* Base Properties Section */}
          <Collapsible open={basePropsOpen} onOpenChange={setBasePropsOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-blue-600" />
                <span className="font-medium text-gray-700">Base Properties</span>
              </div>
              {basePropsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-3">
              {/* Name */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Name</label>
                <Input
                  type="text"
                  name="name"
                  value={formData.name || ''}
                  onChange={handleInputChange}
                  placeholder="Enter node name"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Description</label>
                <Textarea
                  name="description"
                  value={formData.description || ''}
                  onChange={handleInputChange}
                  placeholder="Enter description"
                  rows={3}
                />
              </div>

              {/* Sources for sender/receiver/plugin nodes */}
              {(nodeType === 'sender' || nodeType === 'receiver' || nodeType === 'plugin') && (
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">
                    Sources ({(formData.sources || []).length})
                  </label>
                  <div className="space-y-2">
                    {getSourceColors(formData.sources || []).map(({ source, color }, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <div 
                          className="w-4 h-4 rounded-full border-2 border-white shadow-sm flex-shrink-0"
                          style={{ backgroundColor: color }}
                          title={`Connection point color for ${source || `Source ${idx + 1}`}`}
                        />
                        <Input
                          type="text"
                          value={source}
                          onChange={e => handleSourceChange(idx, e.target.value)}
                          placeholder={`Source ${idx + 1}`}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => handleRemoveSource(idx)}
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={handleAddSource}
                    >
                      + Add Source
                    </Button>
                  </div>
                </div>
              )}

              {/* Access Types */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Access Types</label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`canSend-${selectedNode.id}`}
                      checked={formData.access_types?.canSend !== false}
                      onChange={e => handleAccessTypeChange('canSend', e.target.checked)}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor={`canSend-${selectedNode.id}`} className="text-sm text-gray-700">Can Send</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`canReceive-${selectedNode.id}`}
                      checked={formData.access_types?.canReceive !== false}
                      onChange={e => handleAccessTypeChange('canReceive', e.target.checked)}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor={`canReceive-${selectedNode.id}`} className="text-sm text-gray-700">Can Receive</label>
                  </div>
                </div>
              </div>

              {/* Send/Receive Types */}
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Allowed Send Types</label>
                  <Input
                    type="text"
                    value={(formData.access_types?.allowedSendTypes || []).join(', ')}
                    onChange={e => handleAccessTypeChange('allowedSendTypes', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                    placeholder="e.g., text, json, binary"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Allowed Receive Types</label>
                  <Input
                    type="text"
                    value={(formData.access_types?.allowedReceiveTypes || []).join(', ')}
                    onChange={e => handleAccessTypeChange('allowedReceiveTypes', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                    placeholder="e.g., text, json, binary"
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Custom Properties Section */}
          {Object.keys(customProps).length > 0 && (
            <Collapsible open={customPropsOpen} onOpenChange={setCustomPropsOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-purple-600" />
                  <span className="font-medium text-gray-700">Custom Properties</span>
                  <span className="text-xs bg-purple-200 text-purple-700 px-2 py-1 rounded">
                    {Object.keys(customProps).length}
                  </span>
                </div>
                {customPropsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-3">
                {Object.entries(customProps).map(([key, value]) => (
                  <div key={key}>
                    <label className="text-sm font-medium text-gray-700 mb-1 block capitalize">
                      {key.replace(/_/g, ' ')}
                    </label>
                    <Input
                      type="text"
                      value={typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      onChange={e => setFormData(prev => ({
                        ...prev,
                        [key]: e.target.value,
                      }))}
                      placeholder={`Enter ${key}`}
                    />
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Advanced Section */}
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-red-600" />
                <span className="font-medium text-gray-700">Advanced</span>
              </div>
              {advancedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-3">
              {/* Token Display */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-sm font-medium text-gray-700">Auth Token</label>
                  <span className="relative group">
                    <Info className="h-4 w-4 text-gray-400 cursor-help" />
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 bg-gray-800 text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition pointer-events-none z-10 whitespace-nowrap">
                      Secure access key for node authentication
                    </span>
                  </span>
                </div>
                <SecureTokenDisplay token={formData.token} />
              </div>

              {/* Token Regeneration */}
              <div className="border-t pt-3">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleRegenerateToken}
                  className="w-full"
                >
                  Regenerate Token
                </Button>
                
                {showConfirm && (
                  <div className="mt-3 bg-yellow-50 border border-yellow-300 rounded p-3">
                    <div className="text-sm font-medium text-yellow-800 mb-2">Regenerate token?</div>
                    <div className="text-xs text-yellow-700 mb-3">
                      This will break existing connections. Are you sure?
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={confirmRegenerateToken}
                        className="flex-1"
                      >
                        Yes, Regenerate
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setShowConfirm(false)}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Apply Button - Only show if there are advanced changes */}
          {Object.keys(advancedChanges).length > 0 && (
            <Button
              onClick={handleSubmit}
              className="w-full mt-4"
              size="lg"
            >
              Apply Advanced Changes ({Object.keys(advancedChanges).length})
            </Button>
          )}
          
          {/* Info about auto-save */}
          <div className="text-xs text-gray-500 text-center mt-2">
            Changes to basic properties are applied automatically
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
