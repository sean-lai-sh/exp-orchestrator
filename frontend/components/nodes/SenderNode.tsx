import BaseNode, { BaseNodeProps } from './BaseNode';
import { Handle, Position } from '@xyflow/react';
import { Send } from 'lucide-react';

const SenderNode = (props: BaseNodeProps) => {
  const { data } = props;
  const sources = data.sources || [];
  const canReceive = data.access_types?.canReceive || false;
  
  return (
    <BaseNode {...props} color="bg-blue-100" shapeClass="rounded-lg border-blue-400 border-2">
      <div className="flex items-center gap-2 mb-1">
        <Send className="text-blue-600 h-4 w-4" />
        <span className="font-semibold text-blue-700">Sender</span>
      </div>
      <div className="text-xs text-blue-800 mb-1">
        Sources: {sources.length > 0 ? `${sources.length} outputs` : 'No sources'}
      </div>
      <ul className="text-xs text-blue-900 max-h-16 overflow-y-auto">
        {sources.length === 0 ? (
          <li className="italic text-blue-400">No sources configured</li>
        ) : (
          sources.map((src: string, i: number) => (
            <li key={i} className="truncate">• {src.replace(/_/g, ' ')}</li>
          ))
        )}
      </ul>
      
      {/* Input handle - only show if can receive */}
      {canReceive && (
        <Handle 
          type="target" 
          position={Position.Left} 
          isConnectable={props.isConnectable}
          style={{ background: '#3b82f6' }}
        />
      )}
      
      {/* Output handles - create multiple based on sources */}
      {sources.length > 0 ? (
        sources.map((source, index) => (
          <Handle
            key={`source-${index}`}
            type="source"
            position={Position.Right}
            id={source}
            isConnectable={props.isConnectable}
            style={{ 
              background: '#3b82f6',
              top: `${25 + (index * 15)}%`,
              transform: 'translateY(-50%)'
            }}
          />
        ))
      ) : (
        <Handle 
          type="source" 
          position={Position.Right} 
          isConnectable={props.isConnectable}
          style={{ background: '#3b82f6' }}
        />
      )}
    </BaseNode>
  );
};

export default SenderNode; 