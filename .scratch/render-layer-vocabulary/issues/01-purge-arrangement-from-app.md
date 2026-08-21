# 01 — Purge "arrangement" from the render layer

**What to build:** Stop using "arrangement" — a word `CONTEXT.md` explicitly
avoids for Placement, Layout strategy and Algorithmic View — across
`packages/app` and the two stray `packages/graph` sites. See `spec.md` for the
full reasoning, including why this is not a blind rename to "placement."

**Status:** resolved

- [x] Reword every prose/comment site listed in `spec.md`'s Scope section away
  from "arrangement," choosing the accurate word per sentence (usually
  "placement," sometimes "the Cards on the canvas").
- [x] Pick one replacement name for `canvas-content.ts`'s `'arrangement'` kind
  and `hasArrangement` parameter — the thing being named is "Cards currently
  mounted on the canvas, independent of whether a new placement is being
  computed" — and apply it consistently across `canvas-content.ts`,
  `App.tsx`'s call site, and `canvas-content.test.ts`.
- [x] Reword `packages/graph/src/grid.ts:15` and
  `packages/graph/src/space.property.test.ts:55`.
- [x] Run this as its own commit, separate from any structural change, per
  `docs/agents/workflow.md`'s Renames rule.
- [x] `pnpm verify` and `pnpm e2e` pass; `pnpm e2e:ladle` if a touched file
  backs a story.

## Answer

The word is gone from `packages/`. The one deliberate survivor is
`packages/graph/src/layout.ts`, which quotes the avoid-list in its own doc
comment; `docs/superpowers/plans/` keeps it as a historical record, like an ADR.

**The name chosen for the load-bearing site is `'cards'` / `hasCardsOnCanvas`.**
`CanvasContent`'s third kind is `{ kind: 'cards' }` and `canvasContent`'s second
parameter is `hasCardsOnCanvas`. Both spec candidates were rejected on the spec's
own criterion (b): `hasPlacedCards` and `hasDrawnPlacement` each put "placement"
back into the name of a thing that is true *while the placement is pending*,
which is the exact confusion the ticket exists to prevent. `'cards'` also sits
naturally beside its siblings — the union now reads `failure | cards |
placeholder`, three answers to "what does the canvas draw", where the other two
were already named after what is drawn rather than after a computation.

The prose sites were reworded per sentence rather than by one global synonym:

- "placement" where the thing meant really is the card-to-position map
  (`canvas-projection.ts`, `render-adapter.ts`, `placement-rendering.ts`,
  `fixture-placement.test.ts`, `elk-strategy.ts`, `grid.ts`)
- "Cards on the canvas" where the thing meant is what is currently mounted
  (`App.tsx`, `SpaceCanvas.tsx`, `connection-completion.ts`, `edge-authoring.ts`,
  `PlacementFailure.tsx`)
- "the canvas's `cards` branch" where the prose was pointing at the union member
  (`CanvasCentre.tsx`, `CanvasCentre.test.tsx`)
- plain English where the word was never the domain term at all — "the pairing
  ADR 0039 warns about", "the same setup" (`card-creation.test.tsx`,
  `OpenCard-types.test.tsx`)

**The verb was left alone.** `CONTEXT.md` itself says a Layout strategy is "a
named strategy for arranging a space's cards", so `arrangeFixture`, the
`arrange` test helper and "the thing that arranges Cards" are all correct. Only
the noun names a thing ADR 0005 says does not exist.

### Beyond the listed Scope

Four sites outside the ticket's enumerated file list were swept too, because
leaving them would have made the AGENTS.md claim ("the code now honours this")
false and left a dirty grep for the next session to trip over. All are prose:

- `packages/react-flow-adapter/src/elk/elk-strategy.ts` — same conversion
  sentence as `grid.ts`, which the ticket did list
- `packages/app/stories/support/SelectedEdgeCanvasFixture.tsx`,
  `packages/ui/test/AddCardControl.test.tsx`
- `packages/app/e2e/{editing,new-space}.spec.ts` — three comments and one test
  title. **No assertion, locator or selector was touched**, so the run stays the
  behaviour-preserving evidence the workflow's rename rule asks for.
- `packages/app/example/cards/demo.md` — authored demo content, reworded to "the
  new position is committed to the live backend"

`AGENTS.md`'s standing gotcha was rewritten from "packages/app does not yet
honour that" into the rule that now holds, including why `'cards'` must not be
"fixed" to a placement-flavoured name later.
