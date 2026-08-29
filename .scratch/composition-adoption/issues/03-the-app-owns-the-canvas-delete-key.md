# 03 — The app owns the canvas delete key

**What to build:** Backspace and Delete remove the selected Card or Edge when the key was aimed at the canvas, and do nothing when it was aimed at a menu, a Card picker, a dialog or a Sidebar control — decided once, by a guard the app owns, rather than by React Flow's own `document` listener and the markers scattered through the primitives to hide from it.

**Blocked by:** 02. The guard has to know which surfaces bind keys of their own, and that list does not exist yet.

**Status:** done

Today the canvas hands React Flow a delete key code, React Flow subscribes it on `document`, and it excludes a target only by tag name or by a marker class on an ancestor. Every portalled surface and every chrome control therefore carries that marker — a component in the presentation package encoding another package's listener. The replacement already exists and is already trusted: the canvas has a selector naming what is *not* a canvas command, and three handlers ask it before acting. This ticket makes deletion the fourth, and takes the subscription off React Flow so there is only one.

- [x] The canvas passes no delete key code to React Flow, so React Flow subscribes no delete key at all.
- [x] One handler the app owns answers Backspace and Delete. It asks the not-a-canvas-command selector first, and the selector grows the portalled roles the marker class currently covers — a menu, a listbox, a dialog — so a key pressed inside an open Add Card menu, an Alias target picker or a Card editor still does nothing to the canvas.
- [x] The existing refusals to act are preserved rather than re-derived: while a Card body is being edited, while presenting, and while the Space cannot be authored on, the key does nothing.
- [x] Deleting a selected Edge and deleting a selected Card both still work from the keyboard, and both still go through the authoring operations that own them, with the same completed-Edit lifecycle and the same refusals as the Sidebar and rail routes to those operations.
- [x] Below the breakpoint, where the Sidebar's regions are portalled out of the app root into a Sheet over the canvas, Delete with focus on a Sidebar control does nothing to the canvas. This is the case the marker-class model is weakest at and the one worth driving by hand.
- [x] The existing test that pins "Delete with focus on a canvas renderer row must not delete the selected Edge" still passes, rewritten against the new owner rather than deleted.
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` are green and reported.

## Evidence

- Red: the focused React Flow property and key-inventory tests failed while deletion was still owned by `edge-authoring-react.tsx` and `deleteKeyCode` was `['Backspace', 'Delete']`.
- Green: `pnpm exec vitest run packages/app/test/edge-authoring-react.test.tsx packages/app/test/SpaceCanvas.test.tsx test/unit/key-bindings.test.ts` — 84 tests passed.
- Green: `pnpm typecheck`.
- Green: `pnpm verify` — the complete typecheck, lint, format and coverage gate passed.
- Green: `pnpm e2e` — 139 tests passed.
- Green: `pnpm e2e:ladle` — 52 tests passed.

## Review findings addressed

- Confirmed: the stable native listener's latest-state ref was refreshed in a
  passive effect, leaving a post-commit interval where Delete could use the
  previous selection or refusal state. A regression dispatches Delete from a
  layout effect in the same commit that opens a pane: it failed by deleting the
  selected Edge, then passed once the listener snapshot was installed during
  the synchronous commit phase.
- Confirmed: comments and agent documentation still described React Flow's
  retired delete listener and `onBeforeDelete` dispatch. The dead callback was
  removed and the documentation now describes the app-owned command. Marker
  rationale names React Flow's still-live pan, zoom and node-keyboard readers;
  issue 04 records the complete subscription audit.

## Corrections from the review loop

- The command read the **stored selection** while the assistive description it
  added promised it acts on the focused Card. React Flow never selects a node on
  focus, and only the Edge half of this canvas bridges the two, so Tab to another
  Card and press Delete removed the one selected before it. The command now
  resolves the Card the key was aimed at, exactly as the open command beside it
  does, and falls back to the selection for a press from the pane.
- The refusal was **discarded after `preventDefault`**. `removed-card-from-layout`
  is Layout-only, so on a Computed View the key was consumed in silence while
  `authoring-refusal.ts` already carried the sentence for it. It is now announced
  through the canvas-level `role="alert"` that a finished pointer gesture uses —
  the same case, so the block is renamed `canvas-refusal`.
- The guard checked neither `event.repeat` nor modifiers, which the `C` binding
  sixty lines above rejects with a written rationale. Holding Backspace fired one
  completion per repeat; `Cmd+Backspace` was eaten. Both are excluded now.
- The guard hand-copied React Flow's exclusion list without the one entry every
  excluded surface already declares. `.nokey` is now the first selector, so a
  surface opts out once rather than once per listener — which is what covers
  `CardSearchCombobox`'s popup, whose role is `presentation` rather than `dialog`.

## Leave the markers alone

The marker classes stay exactly where they are in this ticket, dead but harmless, so this lands green on its own. Removing them is issue 04, which first has to establish that no live React Flow subscription still reads them.

## The reason to prefer this over more markers

The current model subtracts from a listener we do not own, one component at a time, and the subtraction is invisible until something breaks — it has already cost a menu opening behind the Sidebar and a Delete reaching the wrong Edge. Owning the subscription inverts that: a surface has to be *included* by the guard rather than remembering to exclude itself, and the guard is one selector with its reasoning written beside it.
