import type { ImageNaturalSize } from '@project/core';
import type { ImageSources } from '#src/image-creation';

/**
 * Image sources with no host behind them, shared by the catalogue and the unit
 * tests (which import `stories/support`; nothing here imports `test/`).
 */

/** An image store that is never reachable, so a chosen file meets the application's own break notice. */
const unreachableStore: ImageSources['store'] = () =>
  Promise.reject(new Error('No image store is reachable.'));

/** Stores nothing and measures no size: for a Space that creates or replaces no image. */
export const storelessImages: ImageSources = {
  store: unreachableStore,
  measure: () => Promise.resolve(undefined),
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
  };
  return { images, release: (size?: ImageNaturalSize) => measuring.resolve(size) };
};
