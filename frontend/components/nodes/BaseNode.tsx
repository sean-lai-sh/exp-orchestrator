import { memo, ReactNode } from 'react';

export interface BaseNodeProps {
  id: string;
  data: any;
  selected: boolean;
  isConnectable: boolean;
  setNodes: any;
  children?: ReactNode;
  color?: string;
  shapeClass?: string;
  glowClass?: string;
  accentColor?: string;
}

const BaseNode = memo(({
  id, data, selected, isConnectable, setNodes, children,
  color = 'bg-[hsl(240_8%_11%)]',
  shapeClass = 'rounded-xl',
  glowClass = '',
  accentColor = 'hsl(195 100% 50%)',
}: BaseNodeProps) => (
  <div
    className={`observatory-node relative min-w-[200px] ${shapeClass} ${glowClass} transition-all duration-200`}
    style={{
      background: 'hsl(240 8% 11%)',
      border: selected ? `1.5px solid ${accentColor}` : '1px solid hsl(240 6% 20%)',
      boxShadow: selected
        ? `0 0 0 1px ${accentColor}, 0 0 24px ${accentColor}22, 0 8px 32px rgba(0,0,0,0.4)`
        : undefined,
    }}
  >
    {/* Top accent bar */}
    <div
      className="absolute top-0 left-3 right-3 h-[2px] rounded-b-full"
      style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`, opacity: 0.5 }}
    />
    <div className="px-4 py-3">
      {children}
    </div>
  </div>
));

export default BaseNode;
