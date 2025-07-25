import { Dispatch, SetStateAction } from "react";
import type { Node } from '@xyflow/react';

export type CompatibilityLevel = 'ok' | 'warn' | 'error';

export type SerializableTypeCompatRule =
  | { from: string; to: string; result: CompatibilityLevel }
  | { default: true; result: CompatibilityLevel };

export type TypeValidator = (from: string, to: string) => CompatibilityLevel;

export type NodeType = 'sender' | 'receiver' | 'plugin';

// Template definitions for pre-configured nodes
export interface NodeTemplate {
  id: string;
  name: string;
  description: string;
  type: NodeType;
  category: string;
  defaultData: Partial<SenderNodeData> | Partial<ReceiverNodeData> | Partial<PluginNodeData>;
}

// 1. Defines the actual `data` object structure for our custom node
export interface EditableNodeData {
  name: string;
  description?: string;
  token: string; // Stores a token for the node
  access_types: { // Defines access capabilities for sending/receiving
    canSend?: boolean; // Make optional
    canReceive?: boolean; // Make optional
    // Optional: specific types of data allowed for sending
    allowedSendTypes?: string[];
    // Optional: specific types of data allowed for receiving
    allowedReceiveTypes?: string[];
  };
  nodeType: NodeType;
  sources?: string[];
  [key: string]: any; // Allow other properties, common for node data
}

export interface SenderNodeData extends EditableNodeData {
  nodeType: 'sender';
  sources: string[];
}
export interface ReceiverNodeData extends EditableNodeData {
  nodeType: 'receiver';
  sources: string[];
}
export interface PluginNodeData extends EditableNodeData {
  nodeType: 'plugin';
}

// 2. Define the props our CustomEditableNode component receives.
// We are not extending NodeProps directly to avoid potential generic type issues.
// Instead, we list the props we expect React Flow to pass for a node component.
export interface CustomEditableNodeComponentProps {
  id: string; // Provided by React Flow
  data: EditableNodeData; // This is the `data` field of the node object
  selected: boolean; // Provided by React Flow
  isConnectable: boolean; // Provided by React Flow
  // Pass setNodes for direct state manipulation in MinimalCanvas
  setNodes: Dispatch<SetStateAction<Node<EditableNodeData>[]>>;
  // Other props from NodeProps like `dragging`, `zIndex`, `type` can be added if needed.
}