import BaseNode, { BaseNodeProps } from './BaseNode';
import { Handle, Position } from '@xyflow/react';
import { Inbox } from 'lucide-react';

const ReceiverNode = (props: BaseNodeProps) => {
  const { data } = props;
  return (
    <BaseNode {...props} color="bg-green-100" shapeClass="rounded-lg border-green-400 border-2">
      <div className="flex items-center gap-2 mb-1">
        <Inbox className="text-green-600 h-4 w-4" />
        <span className="font-semibold text-green-700">Receiver</span>
      </div>
      <div className="text-xs text-green-800 mb-1">Sources:</div>
      <ul className="text-xs text-green-900">
        {(data.sources || []).length === 0 ? <li className="italic text-green-400">No sources</li> :
          (data.sources || []).map((src: string, i: number) => (
            <li key={i}>• {src}</li>
          ))}
      </ul>
      <Handle type="target" position={Position.Left} isConnectable={props.isConnectable} />
    </BaseNode>
  );
};

export default ReceiverNode; 