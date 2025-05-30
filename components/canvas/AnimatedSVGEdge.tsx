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
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const markerId = `arrowhead-${id}`;

  return (
    <>
      <defs>
        <marker
          id={markerId}
          markerWidth="12.5"
          markerHeight="12.5"
          viewBox="-10 -10 20 20"
          orient="auto-start-reverse"
          refX="0"
          refY="0"
        >
          <polyline
            points="-5,-4 0,0 -5,4" // Arrow shape
            stroke="#ff0073" // Arrow color
            strokeWidth="2" // Arrow line thickness
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </marker>
      </defs>
      <BaseEdge id={id} path={edgePath} markerEnd={`url(#${markerId})`} style={{ stroke: '#ff0073', strokeWidth: 2 }} />
      {/* Traversing dot */}
      <circle r="3" fill="#0077ff"> {/* Smaller radius and different color */}
        <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
      </circle>
    </>
  );
} 