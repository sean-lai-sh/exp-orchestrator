'use client';

import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';

export function AnimatedSVGEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const streamLabel = typeof data?.streamType === 'string'
    ? data.streamType
    : typeof data?.label === 'string'
      ? data.label
      : 'json';
  const isInvalid = Boolean(data?.invalid);
  const strokeColor = isInvalid
    ? '#f87171'
    : typeof data?.color === 'string'
      ? data.color
      : '#00d4ff';
  const markerId = `arrowhead-${id}`;
  const glowId = `glow-${id}`;

  return (
    <>
      <defs>
        <marker
          id={markerId}
          markerWidth="10"
          markerHeight="10"
          viewBox="-10 -10 20 20"
          orient="auto-start-reverse"
          refX="0"
          refY="0"
        >
          <polyline
            points="-4,-3 0,0 -4,3"
            stroke={strokeColor}
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.8"
          />
        </marker>
        <filter id={glowId}>
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Glow layer */}
      <path
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth="6"
        strokeOpacity="0.08"
        strokeLinecap="round"
      />

      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={`url(#${markerId})`}
        style={{
          stroke: strokeColor,
          strokeWidth: isInvalid ? 2 : 1.5,
          strokeDasharray: isInvalid ? '8 6' : undefined,
          strokeOpacity: 0.7,
          strokeLinecap: 'round',
        }}
      />

      {/* Animated traversing dot */}
      <circle r="2.5" fill={strokeColor} filter={`url(#${glowId})`}>
        <animateMotion dur="2.5s" repeatCount="indefinite" path={edgePath} />
      </circle>

      {/* Second trailing dot for depth */}
      <circle r="1.5" fill={strokeColor} opacity="0.4">
        <animateMotion dur="2.5s" repeatCount="indefinite" path={edgePath} begin="0.4s" />
      </circle>

      <foreignObject
        width="80"
        height="24"
        x={labelX - 40}
        y={labelY - 12}
        requiredExtensions="http://www.w3.org/1999/xhtml"
      >
        <div className="flex h-6 items-center justify-center">
          <span
            className="inline-flex rounded-full px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider"
            style={{
              background: isInvalid ? 'rgba(248,113,113,0.12)' : 'rgba(255,255,255,0.04)',
              color: isInvalid ? '#f87171' : 'hsl(220 10% 45%)',
              border: `1px solid ${isInvalid ? 'rgba(248,113,113,0.2)' : 'rgba(255,255,255,0.06)'}`,
              backdropFilter: 'blur(8px)',
            }}
          >
            {streamLabel}
          </span>
        </div>
      </foreignObject>
    </>
  );
}
