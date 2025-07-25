import BaseNode, { BaseNodeProps } from './BaseNode';
import { Handle, Position } from '@xyflow/react';
import { ChangeEvent } from 'react';
import { Puzzle } from 'lucide-react';

const PluginNode = (props: BaseNodeProps) => {
  const { id, data, setNodes, isConnectable } = props;
  const sources = data.sources || [];
  const canReceive = data.access_types?.canReceive !== false;
  const canSend = data.access_types?.canSend !== false;

  const handleInputChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setNodes((nds: any) =>
      nds.map((node: any) => {
        if (node.id === id) {
          return { ...node, data: { ...node.data, [name]: value } };
        }
        return node;
      })
    );
  };

  return (
    <BaseNode {...props} color="bg-purple-100" shapeClass="rounded-lg border-purple-400 border-2">
      <div className="flex items-center gap-2 mb-2">
        <Puzzle className="text-purple-600 h-4 w-4" />
        <span className="font-semibold text-purple-700">Plugin</span>
      </div>
      
      <input
        type="text"
        name="name"
        value={data.name}
        onChange={handleInputChange}
        className="p-1 border border-gray-300 rounded-md text-sm w-full mb-1"
        placeholder="Enter name"
      />
      
      <div className="text-xs text-purple-800 mb-1">
        Outputs: {sources.length > 0 ? `${sources.length} available` : 'Basic processing'}
      </div>
      
      <ul className="text-xs text-purple-900 max-h-12 overflow-y-auto mb-2">
        {sources.length === 0 ? (
          <li className="italic text-purple-400">Standard output</li>
        ) : (
          sources.map((src: string, i: number) => (
            <li key={i} className="truncate">• {src.replace(/_/g, ' ')}</li>
          ))
        )}
      </ul>
      
      <textarea
        name="description"
        value={data.description || ''}
        onChange={handleInputChange}
        className="p-1 border border-gray-300 rounded-md text-sm w-full h-8 resize-none text-xs"
        placeholder="Description..."
      />
      
      {/* Input handle - show if can receive */}
      {canReceive && (
        <Handle 
          type="target" 
          position={Position.Left} 
          isConnectable={isConnectable}
          style={{ background: '#8b5cf6' }}
        />
      )}
      
      {/* Output handles - create multiple based on sources */}
      {canSend && (
        sources.length > 0 ? (
          sources.map((source: string, index: number) => (
            <Handle
              key={`source-${index}`}
              type="source"
              position={Position.Right}
              id={source}
              isConnectable={isConnectable}
              style={{ 
                background: '#8b5cf6',
                top: `${25 + (index * 12)}%`,
                transform: 'translateY(-50%)'
              }}
            />
          ))
        ) : (
          <Handle 
            type="source" 
            position={Position.Right} 
            isConnectable={isConnectable}
            style={{ background: '#8b5cf6' }}
          />
        )
      )}
    </BaseNode>
  );
};

export default PluginNode; 