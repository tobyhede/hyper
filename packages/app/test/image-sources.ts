import type { ImageSources } from '../src/image-creation';

/**
 * Image sources for a test that creates no Image Resource: storing refuses to
 * be reached, and nothing loads.
 */
export const unusedImageSources: ImageSources = {
  store: () => Promise.reject(new Error('This test stores no image.')),
  measure: () => Promise.resolve(undefined),
};
