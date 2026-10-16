import type { PresentationLinks } from '#src/presentation-link';

/**
 * Presentation links that reach no other window: nothing posted is heard and
 * nothing arrives. A story or a test that is not about Notes windows presents
 * alone, as `refusingFullscreen` lets it present without fullscreen. Shared by
 * the catalogue and the unit tests.
 */
export const unlinkedPresentations: PresentationLinks = {
  open: () => ({
    post: () => undefined,
    subscribe: () => () => undefined,
    close: () => undefined,
  }),
  now: () => 0,
  leaving: () => () => undefined,
  presence: { hold: () => () => undefined, watch: () => () => undefined },
};
