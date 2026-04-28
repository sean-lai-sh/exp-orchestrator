import { memo, ReactNode } from 'react';

export type NodeKind = 'source' | 'transform' | 'sink';

export interface BaseNodeProps {
  id: string;
  data: any;
  selected: boolean;
  isConnectable: boolean;
  setNodes: any;
  children?: ReactNode;
  // Editorial props
  kind?: NodeKind;
  typeLabel?: string;
}

const KIND_COLOR: Record<NodeKind, string> = {
  source: 'var(--t-source)',
  transform: 'var(--t-transform)',
  sink: 'var(--t-sink)',
};

/**
 * Editorial node shell — type stripe at top, paper background, mono labels,
 * quiet line border. Children fill the body.
 */
const BaseNode = memo(({ data, selected, children, kind = 'transform', typeLabel }: BaseNodeProps) => {
  const stripeColor = KIND_COLOR[kind];
  return (
    <div
      style={{
        position: 'relative',
        width: 240,
        background: 'var(--paper)',
        border: `1px solid ${selected ? stripeColor : 'var(--line-strong)'}`,
        borderRadius: 10,
        boxShadow: selected
          ? `0 0 0 3px color-mix(in oklch, ${stripeColor} 22%, transparent), var(--shadow-card)`
          : 'var(--shadow-card)',
        fontFamily: 'var(--font-sans-orch)',
        color: 'var(--ink)',
        transition: 'box-shadow .15s ease, border-color .15s ease',
      }}
    >
      <div
        style={{
          height: 3,
          background: stripeColor,
          borderTopLeftRadius: 10,
          borderTopRightRadius: 10,
        }}
      />
      <div style={{ padding: '10px 12px 12px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono-orch)',
              color: stripeColor,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {typeLabel ?? kind}
          </div>
          <div
            style={{
              fontSize: 10,
              color: 'var(--ink-4)',
              fontFamily: 'var(--font-mono-orch)',
            }}
          >
            {data?.token ? String(data.token).slice(0, 6) : ''}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
});

BaseNode.displayName = 'BaseNode';

export default BaseNode;
