import * as DialogPrimitive from '@radix-ui/react-dialog';

/**
 * shadcn-style Dialog, built on `@radix-ui/react-dialog` — a covering surface
 * whose focus trap, initial focus, Escape dismissal and `role`/`aria-modal`
 * semantics are the primitive's (ADR 0047).
 *
 * Unstyled, unlike the Command and Select wrappers beside it, and that is the
 * whole difference: the one surface this repo draws with it is the Card pane,
 * whose palette and 16/9 frame are hand-rolled in the app's `styles.css` rather
 * than in Tailwind. A class written here would have to be undone there. What
 * these re-exports buy is the boundary — the primitive layer stays in `ui`
 * (AGENTS.md), so `app` composes a Dialog without naming Radix.
 *
 * `Portal` is deliberately absent, and the reason is *not* positioning: the one
 * overlay drawn with this is `position: fixed`, so it resolves against the
 * initial containing block wherever in the tree it sits. It is absent because
 * nothing needs it — Radix does not require one, and leaving the surface in the
 * app's own tree is what lets the app keep deciding where it renders. The cost
 * to know about: a `transform`, `filter`, `backdrop-filter`, `will-change` or
 * `contain: paint` on any ancestor makes a fixed descendant resolve against
 * *that* element instead, and the overlay would quietly stop covering the
 * viewport. A Portal is the answer if that ever happens; it is not needed
 * pre-emptively.
 *
 * Radix's own scrollable-overlay recipe nests `Content` inside `Overlay`, which
 * is how the pane keeps the frame it letterboxes in — two siblings could not be
 * centred one inside the other.
 *
 * Pinned to an exact version for the reason React Flow is: this primitive owns
 * focus and dismissal, and the app depends on behaviour verified against the
 * release rather than on the documentation alone. Revalidate in a real browser
 * before moving it.
 */
export const Dialog = DialogPrimitive.Root;
export const DialogOverlay = DialogPrimitive.Overlay;
export const DialogContent = DialogPrimitive.Content;
