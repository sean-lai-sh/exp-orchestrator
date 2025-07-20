import BaseNode, { BaseNodeProps } from './BaseNode';
import { Handle, Position } from '@xyflow/react';
import { Send } from 'lucide-react';

const SenderNode = (props: BaseNodeProps) => {
  const { data } = props;
  return (
    <BaseNode {...props} color="bg-blue-100" shapeClass="rounded-lg border-blue-400 border-2">
      <div className="flex items-center gap-2 mb-1">
        <Send className="text-blue-600 h-4 w-4" />
        <span className="font-semibold text-blue-700">Sender</span>
      </div>
      <div className="text-xs text-blue-800 mb-1">Sources:</div>
      <ul className="text-xs text-blue-900">
        {(data.sources || []).length === 0 ? <li className="italic text-blue-400">No sources</li> :
          (data.sources || []).map((src: string, i: number) => (
            <li key={i}>• {src}</li>
          ))}
      </ul>
      <Handle type="source" position={Position.Right} isConnectable={props.isConnectable} />
    </BaseNode>
  );
};

export default SenderNode; 