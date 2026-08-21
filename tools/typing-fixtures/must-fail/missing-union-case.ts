type Refusal = 'not-found' | 'forbidden' | 'conflict';

/**
 * Rejected by: eslint `@typescript-eslint/switch-exhaustiveness-check`, and by
 * `tsc` as TS2366 — the function lacks an ending return statement.
 */
export const describeRefusal = (refusal: Refusal): string => {
  switch (refusal) {
    case 'not-found':
      return 'That is no longer here.';
    case 'forbidden':
      return 'That is not yours to do.';
  }
};
