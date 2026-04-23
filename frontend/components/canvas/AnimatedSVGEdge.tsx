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
    ? '#dc2626'
    : typeof data?.color === 'string'
      ? data.color
      : '#2563eb';
  const markerId = `arrowhead-${id}`;

  return (
    <>
      <defs>
        <marker
          id={markerId}
          markerWidth="12"
          markerHeight="12"
          viewBox="-10 -10 20 20"
          orient="auto-start-reverse"
          refX="0"
          refY="0"
        >
          <polyline
            points="-5,-4 0,0 -5,4"
            stroke={strokeColor}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </marker>
      </defs>

      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={`url(#${markerId})`}
        style={{
          stroke: strokeColor,
          strokeWidth: isInvalid ? 2.5 : 2,
          strokeDasharray: isInvalid ? '8 6' : undefined,
        }}
      />

      <circle r="3" fill={strokeColor}>
        <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
      </circle>

      <foreignObject
        width="120"
        height="28"
        x={labelX - 60}
        y={labelY - 14}
        requiredExtensions="http://www.w3.org/1999/xhtml"
      >
        <div className="flex h-7 items-center justify-center">
          <span
            className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide shadow-sm ${
              isInvalid
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            {streamLabel}
          </span>
        </div>
      </foreignObject>
    </>
  );
}
