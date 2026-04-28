import BaseNode, { BaseNodeProps } from './BaseNode';
import { Handle, Position } from '@xyflow/react';
import { getSourceColor } from '../../lib/sourceColors';

const HANDLE_COLOR = 'var(--t-source)';

const SenderNode = (props: BaseNodeProps) => {
  const { data } = props;
  const sources: string[] = data.sources || [];
  const canReceive = data.access_types?.canReceive || false;

  return (
    <BaseNode {...props} kind="source" typeLabel="source">
      <div
        style={{
          fontSize: 15,
          fontWeight: 500,
          marginTop: 2,
          letterSpacing: '-0.01em',
        }}
      >
        {data.name || 'Sender'}
      </div>
      {data.description && (
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 1 }}>
          {data.description}
        </div>
      )}

      {sources.length > 0 ? (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: '1px dashed var(--line)',
          }}
        >
          {sources.map((src, i) => (
            <div
              key={src + i}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 12,
                color: 'var(--ink-2)',
                padding: '2px 0',
              }}
            >
              <span style={{ fontFamily: 'var(--font-mono-orch)' }}>
                {src.replace(/_/g, ' ')}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono-orch)',
                  color: 'var(--ink-4)',
                  fontSize: 11,
                }}
              >
                out
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            fontSize: 11,
            color: 'var(--ink-4)',
            fontFamily: 'var(--font-mono-orch)',
            marginTop: 8,
          }}
        >
          no sources configured
        </div>
      )}

      {canReceive && (
        <Handle
          type="target"
          position={Position.Left}
          isConnectable={props.isConnectable}
          style={{
            background: 'var(--paper)',
            border: `2px solid ${HANDLE_COLOR}`,
            width: 10,
            height: 10,
            left: -5,
            top: 30,
            boxShadow: '0 0 0 3px var(--paper)',
          }}
        />
      )}

      {sources.length > 0 ? (
        sources.map((source, index) => (
          <Handle
            key={`source-${index}`}
            type="source"
            position={Position.Right}
            id={source}
            isConnectable={props.isConnectable}
            style={{
              background: getSourceColor(index),
              border: '2px solid var(--paper)',
              width: 10,
              height: 10,
              right: -5,
              top: `${30 + index * 18}px`,
              boxShadow: `0 0 0 3px var(--paper)`,
            }}
          />
        ))
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          isConnectable={props.isConnectable}
          style={{
            background: HANDLE_COLOR,
            border: '2px solid var(--paper)',
            width: 10,
            height: 10,
            right: -5,
            top: 30,
            boxShadow: '0 0 0 3px var(--paper)',
          }}
        />
      )}
    </BaseNode>
  );
};

export default SenderNode;
