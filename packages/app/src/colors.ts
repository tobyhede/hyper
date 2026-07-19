import type { Manifest } from '@project/core';

/** Distinct, reasonably accessible rail colors, assigned to paths by order. */
export const PATH_PALETTE = [
  '#6ea8fe', // blue
  '#f59e0b', // amber
  '#34d399', // green
  '#f472b6', // pink
  '#c084fc', // purple
  '#f87171', // red
] as const;

/** Resolve each path's color: its manifest `color`, else a palette slot by order. */
export function pathColorMap(manifest: Manifest): Record<string, string> {
  const map: Record<string, string> = {};
  manifest.paths.forEach((path, index) => {
    map[path.id] = path.color ?? PATH_PALETTE[index % PATH_PALETTE.length] ?? '#8a94a6';
  });
  return map;
}
