interface Palette {
  readonly accent: string;
  readonly muted: string;
}

/**
 * Must survive: `as const satisfies Contract` is how a known value is checked
 * against an owner contract without being widened to it.
 */
export const palette = {
  accent: '#8b5cf6',
  muted: '#64748b',
} as const satisfies Palette;
