/**
 * Rejected by: eslint `@typescript-eslint/no-explicit-any` and
 * `@typescript-eslint/no-unsafe-type-assertion`.
 */
export const escapeHatch = (value: string): number => value as any;
