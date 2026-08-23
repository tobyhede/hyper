import { lazy } from 'react';

/**
 * The Card editor is conditional application UI, and Markdown editing carries
 * CodeMirror's parser and view stack. Keep that stack out of the initial bundle
 * while leaving `OpenCard` itself directly importable by its focused unit and
 * catalogue tests.
 */
export const OpenCard = lazy(async () => {
  const module = await import('./OpenCard');
  return { default: module.OpenCard };
});
