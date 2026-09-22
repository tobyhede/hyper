# 03 — Retire `LinkActionsIcon` now the Resource rail draws the general glyph

**Status:** resolved

**What to build:** Delete `LinkActionsIcon` from `packages/ui/src/icons.tsx` and its export from `packages/ui/src/index.ts`, and bring the prose that still describes it as the rail's glyph up to date: the two review stories that name it, and issue 01, whose every surface is gone.

**Why:** Issue 02 left the Resource rail's glyph out of scope, and left `LinkActionsIcon` named for what the rail drew, deferring the decision until `CardNode` first supplied the actions. That decision was taken without a ticket in `ee767bca` (2026-09-13, "Improve Thing command menu affordance and copy labels"), which made `EntityActionsIcon` the default of `EntityActionsTrigger`, so the rail — the one caller passing no `icon` — draws the general glyph. `ResourceNode` now passes `entityActions` through, fed by `canvas-resource-decoration.ts` from `spaceEntityActions`, so the menu is production-reachable. From then on `LinkActionsIcon` had no production caller, and its doc comment described a decision that had already been taken.

## Answer

- `packages/ui/src/icons.tsx`: `LinkActionsIcon` and its lucide `Link` import deleted.
- `packages/ui/src/index.ts`: its export deleted.
- `packages/app/stories/review/resource-icons.stories.tsx`: the `link` row leaves the spent-glyph table, and the Reference corner-badge note no longer cites a collision with it.
- `packages/app/stories/review/link-actions-prototype.stories.tsx`: the doc comments say the menu is production-reachable and that the sheet stays in `stories/review` only for want of an ADR 0052 parity claim on the rail's Copy link commands.
- `.scratch/link-ux/issues/01-choose-the-link-action-pattern.md`: marked obsolete, with where each of its follow-ups ended up.

Still open, and not this ticket's: the rail's Copy link commands carry no parity claim (`parity-claims.ts`), which is what keeps the link-actions sheet a review story.
