import BaseNode, { BaseNodeProps } from './BaseNode';
import { Handle, Position } from '@xyflow/react';
import { Send } from 'lucide-react';
import { getSourceColor } from '../../lib/sourceColors';

const ACCENT = '#00d4ff';

const SenderNode = (props: BaseNodeProps) => {
  const { data } = props;
  const sources = data.sources || [];
  const canReceive = data.access_types?.canReceive || false;

  return (
    <BaseNode {...props} glowClass="node-glow-sender" accentColor={ACCENT}>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center justify-center w-6 h-6 rounded-md" style={{ background: `${ACCENT}18` }}>
          <Send className="h-3.5 w-3.5" style={{ color: ACCENT }} />
        </div>
        <div>
          <span className="font-semibold text-sm" style={{ color: ACCENT }}>Sender</span>
          <span className="text-[10px] text-[hsl(220_10%_45%)] ml-2 font-mono uppercase tracking-wider">
            {sources.length > 0 ? `${sources.length} out` : 'idle'}
          </span>
        </div>
      </div>
      <div className="text-xs text-[hsl(220_10%_55%)] font-medium mb-1.5 truncate max-w-[180px]">
        {data.name || 'Unnamed'}
      </div>
      <ul className="text-[11px] text-[hsl(220_10%_45%)] max-h-14 overflow-y-auto space-y-0.5">
        {sources.length === 0 ? (
          <li className="italic text-[hsl(220_10%_30%)]">No sources configured</li>
        ) : (
          sources.map((src: string, i: number) => (
            <li key={i} className="truncate flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: getSourceColor(i) }} />
              {src.replace(/_/g, ' ')}
            </li>
          ))
        )}
      </ul>

      {canReceive && (
        <Handle
          type="target"
          position={Position.Left}
          isConnectable={props.isConnectable}
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
              border: `2px solid hsl(240 8% 11%)`,
              boxShadow: `0 0 8px ${getSourceColor(index)}60`,
              width: 10,
              height: 10,
              right: '-5px',
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
      )}
    </BaseNode>
  );
};

export default SenderNode;
