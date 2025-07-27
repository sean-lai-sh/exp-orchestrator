import BaseNode, { BaseNodeProps } from './BaseNode';
import { Handle, Position } from '@xyflow/react';
import { Send } from 'lucide-react';
import { getSourceColor } from '../../lib/sourceColors';

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
          style={{ 
            background: '#3b82f6', 
            border: '2px solid #1e40af',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            left: '-8px',
            top: '50%',
            transform: 'translateY(-50%)'
          }}
        />
      )}
      
      {/* Output handles - create multiple based on sources */}
      {sources.length > 0 ? (
        sources.map((source: string, index: number) => (
          <Handle
            key={`source-${index}`}
            type="source"
            position={Position.Right}
            id={source}
            isConnectable={props.isConnectable}
            style={{ 
              background: getSourceColor(index),
              border: `2px solid ${getSourceColor(index)}`,
              filter: 'brightness(1.1)',
              boxShadow: `0 2px 6px ${getSourceColor(index)}40`,
              right: '-8px',
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
          style={{ 
            background: '#3b82f6', 
            border: '2px solid #1e40af',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            right: '-8px',
            top: '50%',
            transform: 'translateY(-50%)'
          }}
        />
      )}
    </BaseNode>
  );
};

export default SenderNode; 