'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

interface NodeProps {
  data: {
    label: string;
    props: {
      title: string;
      description: string;
    };
  };
  isConnectable: boolean;
  selected?: boolean;
}

function CustomNode({ data, isConnectable, selected }: NodeProps) {
  if (!data || !data.props) {
    return null;
  }

  return (
    <div className={`
      px-4 py-3 shadow-md rounded-lg bg-white 
      border-2 transition-all duration-200 min-w-[200px]
      ${selected ? 'border-blue-500 shadow-lg scale-105' : 'border-gray-200'}
      hover:shadow-lg hover:border-blue-300
    `}>
      <Handle
        type="target"
        position={Position.Top}
        className="w-4 h-4 !bg-blue-500 hover:!bg-blue-600 transition-colors"
        isConnectable={isConnectable}
      />
      <div className="flex flex-col gap-2 relative">
        <div className="font-bold text-lg text-gray-800 border-b border-gray-100 pb-2">
          {data.props.title || 'Untitled Node'}
        </div>
        <div className="text-gray-600 text-sm">
          {data.props.description || 'No description'}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-4 h-4 !bg-blue-500 hover:!bg-blue-600 transition-colors"
        isConnectable={isConnectable}
      />
    </div>
  );
}

export default memo(CustomNode); 