'use client';

import { memo, ChangeEvent, Dispatch, SetStateAction } from 'react';
import { Handle, Position, type Node as RFNodeType } from '@xyflow/react';
// import { Separator } from '../ui/separator'; // User commented this out, respecting that
import type { EditableNodeData, CustomEditableNodeComponentProps } from '../../lib/types'; // Updated import path

// Definitions for EditableNodeData and CustomEditableNodeComponentProps will be removed from here
// ... (Ensure the old interface definitions are deleted by the edit) ...

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
          let newFieldValue: any = value;

          if (name === "canSend" || name === "canReceive") {
            newFieldValue = (event.target as HTMLInputElement).checked;
          } else if (name === "allowedSendTypes" || name === "allowedReceiveTypes") {
            newFieldValue = value.split(',').map(s => s.trim()).filter(s => s);
          }

          let newData: EditableNodeData;
          if (name === "canSend" || name === "canReceive" || name === "allowedSendTypes" || name === "allowedReceiveTypes") {
            newData = {
              ...currentData,
              access_types: {
                ...currentData.access_types,
                [name]: newFieldValue,
              },
            };
          } else {
            newData = {
              ...currentData,
              [name]: newFieldValue,
            };
          }
          return { ...node, data: newData };
        }
        return node;
      })
    );
  };

  if (!data || typeof data.name === 'undefined' || typeof data.token === 'undefined' || typeof data.access_types === 'undefined') {
    return (
        <div className="px-4 py-3 shadow-md rounded-lg bg-red-100 border-2 border-red-300 min-w-[200px]">
            Error: Node data (name/token/access_types) is missing. ID: {id}
        </div>
    );
  }

  return (
    <div className={`
      px-4 py-3 shadow-md rounded-lg bg-white 
      border-2 transition-all duration-200 min-w-[250px]
      ${selected ? 'border-blue-500 shadow-lg' : 'border-gray-200 animate-pulse-border-on-hover'}
      hover:shadow-lg hover:cursor-default 
    `}>
      {/* <Handle
          type="source"
          position={Position.Left}
          style={{
            width: 26,  // larger actual hitbox
            height: 26,
            //background: 'transparent',  // invisible hitbox
            
            right: 26,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 10,
          }}
        >
          <div
            style={{
              width: 10,   // small visible target
              height: 10,
              background: '#555',
              borderRadius: '50%',
              border: '2px solid white',
              position: 'absolute',
              top: '50%',
              left: '0%',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none', // ensure this doesn't block clicks
            }}
          />
        </Handle>
       */}
      <Handle type="target" position={Position.Left} 
        style={{
          width: 20,  // larger actual hitbox
          height: 20,    
        }}
      className="!bg-transparent !border-none" isConnectable={isConnectable}>
        <div
          style={{
            width: 10,   // small visible target
            height: 10,
            background: '#555',
            borderRadius: '50%',
            border: '2px solid white',
            position: 'absolute',
            top: '50%',
            transform: 'translate(50%, -50%)',
            pointerEvents: 'none', // ensure this doesn't block clicks
          }}
        />
      </Handle>
      <div className="flex flex-col gap-2">
        <div className="font-semibold text-gray-700">Node base: {data.name}</div>
        {/* <Separator className="my-2" /> */}
        {/* //<div className="font-semibold text-gray-700">Description:</div> */}
        <textarea 
          name="description"
          value={data.description || 'Description'}
          onChange={handleInputChange}
          className="p-1 border border-gray-300 rounded-md text-sm w-full h-20 resize-none animate-pulse-border-on-hover hover:border-black transition-all duration-200"
          rows={3}
          placeholder="Enter description"
        />
      </div>
      <Handle type="source" position={Position.Right} 
      style={{
        width: 20,  // larger actual hitbox
        height: 20,    
      }}
      className="!bg-transparent !border-none" isConnectable={isConnectable}>
        <div
          style={{
            width: 10,   // small visible target
            height: 10,
            background: '#555',
            borderRadius: '50%',
            border: '2px solid white',
            position: 'absolute',
            top: '50%',
            transform: 'translate(50%, -50%)',
            pointerEvents: 'none', // ensure this doesn't block clicks
          }}
        />
      </Handle>
    </div>
  );
}

export default memo(CustomEditableNode); 