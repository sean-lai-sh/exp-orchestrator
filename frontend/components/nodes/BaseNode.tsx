import { memo, ReactNode } from 'react';
import { Handle, Position } from '@xyflow/react';

export interface BaseNodeProps {
  id: string;
  data: any;
  selected: boolean;
  isConnectable: boolean;
  setNodes: any;
  children?: ReactNode;
  color?: string;
  shapeClass?: string;
}

const BaseNode = memo(({
  id, data, selected, isConnectable, setNodes, children, color = 'bg-gray-100', shapeClass = 'rounded-lg'
}: BaseNodeProps) => (
  <div className={`px-4 py-3 shadow-md border-2 min-w-[180px] ${color} ${shapeClass} ${selected ? 'border-blue-500' : 'border-gray-200'}`}>
    {children}
  </div>
));

export default BaseNode; 