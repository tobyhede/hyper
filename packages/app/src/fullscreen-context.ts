import { createContext } from 'react';
import type { Fullscreen } from './presenting-fullscreen';

/** A host that offers no fullscreen: every request is refused and nothing ever changes. */
const NO_FULLSCREEN: Fullscreen = {
  enter: () => Promise.resolve(false),
  exit: () => undefined,
  active: () => false,
  subscribe: () => () => undefined,
};

/**
 * The browser's fullscreen, named once at the composition root (`main.tsx`).
 *
 * A mount with no provider — a test, a story — has no fullscreen, which a
 * presentation tolerates exactly as it tolerates a refused request.
 */
export const FullscreenContext = createContext<Fullscreen>(NO_FULLSCREEN);
