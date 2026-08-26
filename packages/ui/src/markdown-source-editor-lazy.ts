import { lazy } from 'react';

/**
 * The split point that keeps CodeMirror's stack out of the initial bundle
 * (ADR 0063), owned by the package the editor lives in.
 *
 * It used to live in `app`, because `app` was the only consumer and a dynamic
 * import there was enough. `MarkdownCardBody` is the second consumer and it
 * lives here, so a static import from it would put the whole stack back into
 * the barrel — and from the barrel into every consumer of `@project/ui`,
 * including the adapter, with nothing in `app` to catch it. Beside the
 * component that needs it, the guarantee holds for both.
 *
 * `test/unit/codemirror-encapsulation.test.ts` holds this to being the one
 * module in either source tree that names the editor.
 */
export const MarkdownSourceEditor = lazy(async () => {
  const module = await import('./MarkdownSourceEditor');
  return { default: module.MarkdownSourceEditor };
});
