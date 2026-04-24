import BaseNode, { BaseNodeProps } from './BaseNode';
import { Handle, Position } from '@xyflow/react';
import { ChangeEvent } from 'react';
import { Puzzle } from 'lucide-react';
import { getSourceColor } from '../../lib/sourceColors';

const ACCENT = '#fbbf24';

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
    <BaseNode {...props} glowClass="node-glow-plugin" accentColor={ACCENT}>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center justify-center w-6 h-6 rounded-md" style={{ background: `${ACCENT}18` }}>
          <Puzzle className="h-3.5 w-3.5" style={{ color: ACCENT }} />
        </div>
        <div>
          <span className="font-semibold text-sm" style={{ color: ACCENT }}>Plugin</span>
          <span className="text-[10px] text-[hsl(220_10%_45%)] ml-2 font-mono uppercase tracking-wider">
            {sources.length > 0 ? `${sources.length} out` : 'transform'}
          </span>
        </div>
      </div>

      <input
        type="text"
        name="name"
        value={data.name}
        onChange={handleInputChange}
        className="w-full px-2 py-1 text-xs rounded-md border bg-[hsl(240_8%_8%)] border-[hsl(240_6%_20%)] text-[hsl(220_10%_85%)] placeholder:text-[hsl(220_10%_30%)] focus:outline-none focus:border-[#fbbf24] focus:ring-1 focus:ring-[#fbbf24]/30 transition-colors mb-1.5"
        placeholder="Enter name"
      />

      <ul className="text-[11px] text-[hsl(220_10%_45%)] max-h-12 overflow-y-auto space-y-0.5 mb-1.5">
        {sources.length === 0 ? (
          <li className="italic text-[hsl(220_10%_30%)]">Standard output</li>
        ) : (
          sources.map((src: string, i: number) => (
            <li key={i} className="truncate flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: getSourceColor(i) }} />
              {src.replace(/_/g, ' ')}
            </li>
          ))
        )}
      </ul>

      <textarea
        name="description"
        value={data.description || ''}
        onChange={handleInputChange}
        className="w-full px-2 py-1 text-[11px] rounded-md border bg-[hsl(240_8%_8%)] border-[hsl(240_6%_20%)] text-[hsl(220_10%_70%)] placeholder:text-[hsl(220_10%_30%)] focus:outline-none focus:border-[#fbbf24] focus:ring-1 focus:ring-[#fbbf24]/30 resize-none h-7 transition-colors"
        placeholder="Description..."
      />

      {canReceive && (
        <Handle
          type="target"
          position={Position.Left}
          isConnectable={isConnectable}
          style={{
            background: ACCENT,
            border: `2px solid hsl(240 8% 11%)`,
            boxShadow: `0 0 8px ${ACCENT}60`,
            width: 10,
            height: 10,
            left: '-5px',
            top: '50%',
            transform: 'translateY(-50%)'
          }}
        />
      )}

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
                background: getSourceColor(index),
                border: `2px solid hsl(240 8% 11%)`,
                boxShadow: `0 0 8px ${getSourceColor(index)}60`,
                width: 10,
                height: 10,
                right: '-5px',
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
            style={{
              background: ACCENT,
              border: `2px solid hsl(240 8% 11%)`,
              boxShadow: `0 0 8px ${ACCENT}60`,
              width: 10,
              height: 10,
              right: '-5px',
              top: '50%',
              transform: 'translateY(-50%)'
            }}
          />
        )
      )}
    </BaseNode>
  );
};

export default PluginNode;
