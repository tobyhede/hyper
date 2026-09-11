/** Must survive: `as const` preserves the literal types rather than widening them. */
export const thingKinds = ['markdown', 'alias'] as const;
