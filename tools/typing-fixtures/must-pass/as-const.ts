/** Must survive: `as const` preserves the literal types rather than widening them. */
export const resourceKinds = ['markdown', 'reference'] as const;
