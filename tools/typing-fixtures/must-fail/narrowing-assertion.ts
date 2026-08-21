interface Refusal {
  readonly code: string;
}

interface NotFound {
  readonly code: 'not-found';
}

/**
 * Rejected by: eslint `@typescript-eslint/no-unsafe-type-assertion`.
 *
 * It carries a `SAFETY:` comment, so `anti-slop/require-safety-comment-for-type-assertion`
 * is satisfied and says nothing. That is the whole point of ADR 0062: prose is
 * the cheapest thing an agent produces, and until the ratchet went on, this
 * passed every gate the repository had.
 */
export const asNotFound = (refusal: Refusal): NotFound =>
  // SAFETY: the caller only reaches this after matching on the code.
  refusal as NotFound;
