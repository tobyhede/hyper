import type { ImageNaturalSize } from '@project/core';
import { pickFilesInBrowser } from '#src/browser-file-picker';
import type { ImageSources } from '#src/image-creation';

/**
 * Image sources with no host behind them, shared by the catalogue and the unit
 * tests (which import `stories/support`; nothing here imports `test/`).
 */

/** An image store that is never reachable, so a chosen file meets the application's own break notice. */
const unreachableStore: ImageSources['store'] = () =>
  Promise.reject(new Error('No image store is reachable.'));

/** The browser's own picker, reached only when a press asks for it. */
const browserPick: ImageSources['pick'] = (accept) => pickFilesInBrowser(document)(accept);

/** Stores nothing and measures no size: for a Space that creates or replaces no image. */
export const storelessImages: ImageSources = {
  store: unreachableStore,
  measure: () => Promise.resolve(undefined),
  pick: browserPick,
};

/**
 * Stores nothing, and measuring any URL waits until `release` answers it.
 *
 * What a Space that needs an image gesture held open asks it to wait on, so
 * the busy state is the real one. Never released, it holds for as long as the
 * Space is open.
 */
export const heldImageSources = () => {
  const measuring = Promise.withResolvers<ImageNaturalSize | undefined>();
  const images: ImageSources = {
    store: unreachableStore,
    measure: () => measuring.promise,
    pick: browserPick,
  };
  return { images, release: (size?: ImageNaturalSize) => measuring.resolve(size) };
};
