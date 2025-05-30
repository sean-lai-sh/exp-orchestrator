'use client';

import { memo, ChangeEvent, Dispatch, SetStateAction } from 'react';
import { Handle, Position, type Node as RFNodeType } from '@xyflow/react';

// 1. Defines the actual `data` object structure for our custom node
export interface EditableNodeData {
  title: string;
  description: string;
  [key: string]: any; // Allow other properties, common for node data
}

// 2. Define the props our CustomEditableNode component receives.
// We are not extending NodeProps directly to avoid potential generic type issues.
// Instead, we list the props we expect React Flow to pass for a node component.
interface CustomEditableNodeComponentProps {
  id: string; // Provided by React Flow
  data: EditableNodeData; // This is the `data` field of the node object
  selected: boolean; // Provided by React Flow
  isConnectable: boolean; // Provided by React Flow
  // Pass setNodes for direct state manipulation in MinimalCanvas
  setNodes: Dispatch<SetStateAction<RFNodeType<EditableNodeData>[]>>;
  // Other props from NodeProps like `dragging`, `zIndex`, `type` can be added if needed.
}

function CustomEditableNode({
  id,
  data,
  selected,
  isConnectable,
  setNodes,
}: CustomEditableNodeComponentProps) {

  const handleInputChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          const currentData = node.data; // Should be EditableNodeData due to RFNodeType<EditableNodeData>[]
          const newData: EditableNodeData = {
            ...currentData,
            [name]: value,
          };
          return { ...node, data: newData };
        }
        return node;
      })
    );
  };

  if (!data || typeof data.title === 'undefined' || typeof data.description === 'undefined') {
    return (
        <div className="px-4 py-3 shadow-md rounded-lg bg-red-100 border-2 border-red-300 min-w-[200px]">
            Error: Node data (title/description) is missing. ID: {id}
        </div>
    );
  }

  return (
    <div className={`
      px-4 py-3 shadow-md rounded-lg bg-white 
      border-2 transition-all duration-200 min-w-[250px]
      ${selected ? 'border-blue-500 shadow-lg' : 'border-gray-200'}
      hover:shadow-lg hover:border-blue-300
    `}>
      <Handle type="target" position={Position.Left} className="w-3 h-3 !bg-blue-500" isConnectable={isConnectable} />
      <div className="flex flex-col gap-2">
        <div className="font-semibold text-gray-700">Title: (ID: {id})</div>
        <input 
          type="text"
          name="title"
          value={data.title}
          onChange={handleInputChange}
          className="p-1 border border-gray-300 rounded-md text-sm w-full"
          placeholder="Enter title"
        />
        <div className="font-semibold text-gray-700 mt-2">Description:</div>
        <textarea 
          name="description"
          value={data.description}
          onChange={handleInputChange}
          className="p-1 border border-gray-300 rounded-md text-sm w-full h-20 resize-none"
          rows={3}
          placeholder="Enter description"
        />
      </div>
      <Handle type="source" position={Position.Right} className="w-3 h-3 !bg-blue-500" isConnectable={isConnectable} />
    </div>
  );
}

export default memo(CustomEditableNode); 