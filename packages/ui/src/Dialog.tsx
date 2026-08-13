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
 * `Portal` is deliberately absent. The pane's overlay is positioned against the
 * app's own container, and a Portal to `document.body` would resolve `inset: 0`
 * against the initial containing block instead. Radix does not require one, and
 * its own scrollable-overlay recipe nests `Content` inside `Overlay`, which is
 * how the pane keeps the frame it letterboxes in.
 *
 * Pinned to an exact version for the reason React Flow is: this primitive owns
 * focus and dismissal, and the app depends on behaviour verified against the
 * release rather than on the documentation alone. Revalidate in a real browser
 * before moving it.
 */
export const Dialog = DialogPrimitive.Root;
export const DialogOverlay = DialogPrimitive.Overlay;
export const DialogContent = DialogPrimitive.Content;
