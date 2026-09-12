import { useEffect, useSyncExternalStore, type RefObject } from 'react';
import type { Continuation } from '../continuation';

/**
 * The half of {@link Continuation} that can reach the Space chrome.
 *
 * Mounted at the App root, outside `ReactFlowProvider`, because a chrome control
 * needs nothing but the DOM. It owns the `control` kind.
 *
 * A control is found by `data-continuation-control` rather than held as a ref,
 * in **one** place rather than at each call site. The attribute matters for a
 * second reason as well: an open pane marks the root `inert`, and an addressing
 * query is how a covered control is reached at all. The query is scoped to the
 * Space that raised it — see {@link ChromeContinuation}'s `within`.
 *
 * It used to own a `sidebar-row` kind beside this one, resolved by walking a
 * row's addressing attribute up to its `<li>` — the Sidebar drew a row's title
 * as a button and its live rename as a `div`, so the element the attribute found
 * could be the unfocusable one. The Command Dock's editor replaces the one
 * control it was opened from and hands focus back itself, so neither the kind
 * nor the walk survived the surface.
 */
const elementOf = (root: ParentNode, name: string): HTMLElement | null =>
  root.querySelector<HTMLElement>(`[data-continuation-control="${CSS.escape(name)}"]`);

export function ChromeContinuation({
  continuation,
  within,
}: {
  readonly continuation: Continuation;
  /**
   * The subtree this Space's chrome is drawn in.
   *
   * **Scoped rather than `document`-wide**, because every open Space stays
   * mounted — hidden with `hidden`, not unmounted, so a Space keeps its Diagram
   * selection and its traversal (`OpenSpacesApplication.tsx`). A whole-document
   * query takes the first match in document order, which is whichever Space was
   * opened first, and `focus()` on an element inside a `hidden` subtree does
   * nothing at all: the caret went nowhere and the reader was told nothing.
   * Falls back to `document` only while the ref is unattached, which is the one
   * render before this effect can run anyway.
   */
  readonly within: RefObject<HTMLElement | null>;
}) {
  const { pending } = useSyncExternalStore(continuation.subscribe, continuation.getState);

  useEffect(() => {
    if (pending === null) return;
    const { target } = pending;
    if (target.kind !== 'control') return;
    // Chrome falls through: it is drawn already, so an element this cannot find
    // is gone rather than on its way, and nothing is owed for a wait with no
    // end.
    continuation.take();
    const element = elementOf(within.current ?? document, target.name);
    if (element === null) return;
    // `then` is read rather than assumed: the module's four values are one type
    // for both adapters, so an arm this cannot honour — `reveal` has no meaning
    // off the canvas — is spent quietly instead of silently taking the caret.
    if (pending.then === 'focus') {
      element.focus();
      return;
    }
    /*
     * **A rename is begun by pressing the control, because that is what the
     * control does.** The Dock's names are `button`s whose click starts the
     * in-place editor (`IdentityName`), and the editor focuses itself on mount
     * — so a `focus()` here would leave the caret on the button and an
     * application-driven rename would need a second way into the same state,
     * kept in step with the reader's. Dispatching the press instead means Add
     * Diagram arrives exactly where a reader who clicked the name arrives.
     *
     * A control the application has withdrawn is a control this cannot press:
     * Base UI suppresses activation for a disabled item, so an unavailable
     * name simply does not open, which is the same answer the reader gets.
     */
    if (pending.then === 'rename') element.click();
  }, [pending, continuation, within]);

  return null;
}
