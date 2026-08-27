# 04 — Snap Resize to Close

**What to build:** Let an author Close an Open Card by resizing it toward the
fixed Closed rect. When both proposed dimensions enter an application-owned
magnetic range, the transient canvas previews the exact Closed Size; releasing
performs one Close Edit and preserves the previous Open Size for the next Open.

**Blocked by:** 03 — Preview resizing through one canvas draft.

**Status:** resolved

- [x] The magnetic distance is an application-owned UX token measured in canvas
      coordinates, not persisted state or a general spatial grid.
- [x] A review story demonstrates outside, entering, and inside the magnetic
      range at multiple zoom levels so the token can be tuned against the real
      production interaction.
- [x] Reaching only the Closed width or only the Closed height leaves the Card
      Open; Close occurs only when both dimensions resolve to the complete
      Closed rect.
- [x] The Card remains Open for the active pointer gesture while the canvas
      previews the snapped rect; release completes one Close Edit.
- [x] Resize-to-Close does not first persist a smaller Open Size. Reopening,
      including after reload, restores the Open Size held before the closing
      gesture.
- [x] Space Authoring decides whether the final proposed dimensions complete
      Resize or Close; React Flow event wiring does not duplicate that domain
      transition.
- [x] General Move/Resize grid snapping remains out of scope.
- [x] Accept ADR 0066 only after its model, preview and close-snap claims match
      the implemented behavior; update scoped agent documentation that described
      the former Expanded representation.
- [x] Production-parity application, Ladle and browser evidence cover the snap
      boundary, Close completion, preserved Open Size and reload.
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass, with the real output
      recorded.

## Answer

The application now owns `CARD_CLOSE_SNAP_DISTANCE`, a 24-canvas-unit magnetic
range, and `snapCardSizeToClose`. A proposal within that range on both axes is
replaced by the exact 260×146 Closed rect; one-axis matches and proposals one
unit outside remain ordinary Open resizes. The render adapter layers the snapped
size into its existing Layout-wide resize draft, so the Card and every derived
canvas geometry preview together while the Card stays Open for the gesture.

Release sends the exact final size through the existing `resized-card`
completion. Space Authoring alone interprets the exact Closed rect as Close and
retains the entry's previous `openSize`, producing one Edit rather than a small
Resize followed by Close. The browser test grows a Card to a non-default Open
Size, snaps it Closed, observes no persistence during the draft and exactly one
revision on release, reloads while Closed, then reopens to the remembered size.

`Review/Card Resize Close Snap` renders the real production Card node and snap
function at 0.5×, 1× and 2× viewport zoom, with proposals outside, on and inside
the boundary. The stable Card story and its paired Ladle/application parity
evidence prove the production preview. ADR 0066 is accepted, and the rendering
and editing agent guidance records the final ownership split. General grid
snapping was not added.

Final verification: `pnpm verify` — 155 test files, 1,747 passed, 8 skipped;
`pnpm e2e` — 114 passed; `pnpm e2e:ladle` — 50 passed. All exited 0.
