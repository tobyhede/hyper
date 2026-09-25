import { lazy } from 'react';

/**
 * The split point that keeps CodeMirror's stack out of the initial bundle
 * (ADR 0063), owned by the package the editor lives in.
 *
 * `MarkdownResourceBody` consumes the editor from inside this package, so a
 * static import from it would put the whole stack into the barrel — and from
 * the barrel into every consumer of `@project/ui`, including the adapter. Do
 * not move the split point to `app`: nothing there would catch that import.
 *
 * `test/unit/codemirror-encapsulation.test.ts` holds this to being the one
 * module in either source tree that names the editor.
 */
export const MarkdownSourceEditor = lazy(async () => {
  const module = await import('./MarkdownSourceEditor');
  return { default: module.MarkdownSourceEditor };
});
