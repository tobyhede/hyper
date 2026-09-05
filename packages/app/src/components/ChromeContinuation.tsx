import { useEffect, useSyncExternalStore } from 'react';
import type { Continuation, ContinuationTarget } from '../continuation';

/**
 * The half of {@link Continuation} that can reach the Space chrome.
 *
 * Mounted at the App root, outside `ReactFlowProvider`, because a Sidebar row
 * and a toolbar control need nothing but `document`. It owns
 * `sidebar-row | control`.
 *
 * A row is found by its own addressing attribute and then walked up to its
 * `<li>`, in **one** place rather than at each rename's call site. Both matter:
 * an open pane marks the root `inert`, so the attribute is how a covered
 * Sidebar is reached at all, and a row draws its title as a button and its live
 * rename as a `div` — both carrying the attribute — so the element the
 * attribute finds may be the unfocusable one. The `<li>` is what survives that
 * swap.
 */
const elementOf = (target: ContinuationTarget): HTMLElement | null => {
  if (target.kind === 'sidebar-row') {
    return (
      document
        .querySelector(`[data-${target.entity.kind}-id="${CSS.escape(target.entity.id)}"]`)
        ?.closest('li') ?? null
    );
  }
  if (target.kind !== 'control') return null;
  return document.querySelector<HTMLElement>(
    `[data-continuation-control="${CSS.escape(target.name)}"]`,
  );
};

export function ChromeContinuation({ continuation }: { readonly continuation: Continuation }) {
  const { pending } = useSyncExternalStore(continuation.subscribe, continuation.getState);

  useEffect(() => {
    if (pending === null) return;
    const { target } = pending;
    if (target.kind !== 'sidebar-row' && target.kind !== 'control') return;
    // Chrome falls through: it is drawn already, so an element this cannot find
    // is gone rather than on its way, and nothing is owed for a wait with no
    // end. The control a cancelled pane returns to is only ever *disabled*
    // while the pane is up, and the render that publishes this is the render
    // that closes it.
    continuation.take();
    elementOf(target)?.focus();
  }, [pending, continuation]);

  return null;
}
