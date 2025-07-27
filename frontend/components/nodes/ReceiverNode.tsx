import BaseNode, { BaseNodeProps } from './BaseNode';
import { Handle, Position } from '@xyflow/react';
import { Inbox } from 'lucide-react';
import { getSourceColor } from '../../lib/sourceColors';

const ReceiverNode = (props: BaseNodeProps) => {
  const { data } = props;
  const sources = data.sources || [];
  const canSend = data.access_types?.canSend || false;
  
  return (
    <BaseNode {...props} color="bg-green-100" shapeClass="rounded-lg border-green-400 border-2">
      <div className="flex items-center gap-2 mb-1">
        <Inbox className="text-green-600 h-4 w-4" />
        <span className="font-semibold text-green-700">Receiver</span>
      </div>
      <div className="text-xs text-green-800 mb-1">
        Outputs: {sources.length > 0 ? `${sources.length} available` : 'Processing only'}
      </div>
      <ul className="text-xs text-green-900 max-h-16 overflow-y-auto">
        {sources.length === 0 ? (
          <li className="italic text-green-400">Processing node</li>
        ) : (
          sources.map((src: string, i: number) => (
            <li key={i} className="truncate">• {src.replace(/_/g, ' ')}</li>
          ))
        )}
      </ul>
      
      {/* Always show input handle for receivers */}
      <Handle 
        type="target" 
        position={Position.Left} 
        isConnectable={props.isConnectable}
        style={{ 
          background: '#10b981', 
          border: '2px solid #059669',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          left: '-8px',
          top: '50%',
          transform: 'translateY(-50%)'
        }}
      />
      
      {/* Output handles - only if can send and has sources */}
      {canSend && sources.length > 0 && (
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
      )}
    </BaseNode>
  );
};

export default ReceiverNode; 