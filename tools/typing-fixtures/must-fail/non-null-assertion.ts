/**
 * Rejected by: eslint `@typescript-eslint/no-non-null-assertion`.
 *
 * The exemption for this rule is scoped to tests and e2e, and this file is
 * neither, so it stands in for production code.
 */
export const firstTitle = (titles: readonly string[]): string => titles[0]!;
