'use client';

import React from 'react';
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';

export function AnimatedSVGEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  data,
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
  });

  // Edge color: prefer custom data.color (set by onConnect), then style.stroke,
  // otherwise fall back to the editorial transform tint.
  const dataColor = (data as { color?: string } | undefined)?.color;
  const styleStroke = (style as { stroke?: string } | undefined)?.stroke;
  const color = dataColor ?? styleStroke ?? 'var(--t-transform)';

  const arrowId = `arrow-${id}`;

  return (
    <>
      <defs>
        <marker
          id={arrowId}
          markerWidth="10"
          markerHeight="10"
          viewBox="-6 -6 12 12"
          orient="auto-start-reverse"
          refX="0"
          refY="0"
        >
          <polyline
            points="-3,-3 0,0 -3,3"
            stroke={color}
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </marker>
      </defs>

      {/* Soft underlay so the edge reads against the warm paper grid */}
      <BaseEdge
        id={`${id}-glow`}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: 5,
          opacity: 0.08,
          fill: 'none',
        }}
      />

      {/* Living dashed edge */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={`url(#${arrowId})`}
        style={{
          stroke: color,
          strokeWidth: 1.5,
          strokeDasharray: '6 6',
          fill: 'none',
          animation: 'flow-dash 1.6s linear infinite',
        }}
      />

      {/* Traveling packet */}
      <circle r="2.5" fill={color} opacity="0.9">
        <animateMotion dur="2.4s" repeatCount="indefinite" path={edgePath} />
      </circle>
    </>
  );
}
