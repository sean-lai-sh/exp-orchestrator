// Luminous colors optimized for dark backgrounds
export const sourceColors = [
  '#00d4ff', // electric cyan
  '#34d399', // emerald
  '#a78bfa', // soft violet
  '#fbbf24', // amber
  '#f87171', // coral red
  '#38bdf8', // sky blue
  '#a3e635', // lime
  '#f472b6', // pink
  '#818cf8', // indigo
  '#2dd4bf', // teal
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
