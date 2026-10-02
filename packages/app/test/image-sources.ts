import type { ImageSources } from '../src/image-creation';

/**
 * Image sources for a test that creates no Image Resource: storing refuses to
 * be reached, and nothing loads.
 */
export const unusedImageSources: ImageSources = {
  store: () => Promise.reject(new Error('This test stores no image.')),
  measure: () => Promise.resolve(undefined),
};

/**
 * Image sources that hold a replacement open: storing is never reached, and
 * measuring a URL waits until the test releases it, answering no size.
 *
 * What a test that needs the Space held asks its Image Resource's replacement
 * to wait on, so the busy state is the real one rather than a stand-in.
 */
export const heldImageSources = () => {
  const measuring = Promise.withResolvers<undefined>();
  const images: ImageSources = {
    store: () => Promise.reject(new Error('This test stores no image.')),
    measure: () => measuring.promise,
  };
  return { images, release: () => measuring.resolve(undefined) };
};
