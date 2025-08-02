// Utility for generating consistent colors for sources
export const sourceColors = [
  '#3b82f6', // blue
  '#10b981', // emerald 
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#ef4444', // red
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#ec4899', // pink
  '#6366f1', // indigo
  '#14b8a6', // teal
];

export function getSourceColor(index: number): string {
  return sourceColors[index % sourceColors.length];
}

export function getSourceColors(sources: string[]): Array<{source: string, color: string}> {
  return sources.map((source, index) => ({
    source,
    color: getSourceColor(index)
  }));
}
