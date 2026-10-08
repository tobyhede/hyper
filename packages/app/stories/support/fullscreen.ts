import type { Fullscreen } from '#src/presenting-fullscreen';

/**
 * A host that refuses fullscreen: every request answers `false` and fullscreen
 * never changes. Presenting tolerates it as it tolerates a refused request, so
 * a story or a test that is not about fullscreen presents on the Stage alone.
 * Shared by the catalogue and the unit tests, as `image-sources.ts` is.
 */
export const refusingFullscreen: Fullscreen = {
  enter: () => Promise.resolve(false),
  exit: () => undefined,
  active: () => false,
  subscribe: () => () => undefined,
};
