/** Must survive: `as const` preserves the literal types rather than widening them. */
export const cardKinds = ['markdown', 'alias'] as const;
