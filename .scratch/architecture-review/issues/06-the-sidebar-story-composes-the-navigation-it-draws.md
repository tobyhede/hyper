# The sidebar story composes the Navigation it draws

Status: resolved

Surfaced by: the 2026-08-19 architecture review, candidate 1, and upheld by its
adversarial audit as the only pair of confirmed, observable ADR 0052 violations
in shipped evidence.

Blocked by: issue 05, and issue 04 through it. Both are vocabulary and shape; this
is the one with behaviour to prove, so it lands last and is written once.

## The defect

`packages/app/stories/support/WorkspaceSidebarFixture.tsx` derives two values
that production derives differently, and gets both wrong on screen.

```
production   graphs      renderer.subject.graphs        canvas-projection.ts:77
             active      openingGraphId(renderer)       navigation.ts:108-112
             on select   navigation.selectRenderer      navigation.ts:183-197

fixture      graphs      space.graphs                   :78
             active      space.graphs[0]?.id            :56
             on select   setSelected                    :76
```

Measured on `stories/support/spaces.ts`, the Space the catalogue draws:

| | production | shipped story |
|---|---|---|
| Graphs drawn on **Collection 1** | Long · Mid · Short | Long · Mid · Short · **Echo** |
| Active Graph after selecting **Collection 2** | Echo | **Long** — a Graph Collection 2 does not own |

Echo belongs to Collection 2. `defaultRenderer` opens the Space on Collection 1,
whose subject is its own three Graphs, so the `Settled` story draws a row the
application never shows. And because `onSelect` is `setSelected`, choosing a
canvas in the story never recomputes the Active Graph — production publishes both
in one operation.

No Ladle spec and no application test catches either.

Under ADR 0052 a harness may supply environment and public inputs and may not
replace state translation. Deriving the drawn Graphs and the opening Graph is
state translation, and the fixture owns both.

## Why a derivation module is the wrong answer

The obvious fix — give the two values a pure module beside `canvasRenderers` —
closes the first drift and leaves the second standing in a different shape. The
Active Graph is not a derivation the story is missing; it is a *publication*.
`navigation.selectRenderer` publishes the id, `openingGraphId(renderer)`,
`mode: 'overview'` and `openedCardId: null` together. Handed a pure
`openingGraph(space, id)`, the fixture would write
`setSelected(id); setActiveGraph(opening(space, id))` — a hand-rolled copy of
that operation, which is exactly what 0052 forbids.

A module would also be a seam with one caller, which is the objection the
adversarial audit raised against half its own first pass.

## What to build

The fixture composes the production collaborators instead of deriving anything:

```
createRendererResolver({ newGraphId })
createNavigation(currentSpace, resolveRenderer, defaultRenderer(space), space)
useSyncExternalStore(navigation.subscribe, navigation.getState)
```

Then:

| prop | comes from |
|---|---|
| `canvas.renderers` / `canvas.current` | `canvasRenderers(space)` / `currentRenderer(…, state.selectedRenderer)` |
| `canvas.onSelect` | `navigation.selectRenderer` |
| `graph.graphs` | `resolveRenderer(space, state.selectedRenderer).subject.graphs` |
| `graph.activeGraphId` | `state.activeGraphId` |
| `graph.onActivate` | `navigation.activateGraph` |
| `graph.presenting` | `state.mode === 'presenting'` |
| `graph.onPresent` / `onExitPresenting` | `navigation.present` / `navigation.exitPresenting` |

**Take what composition makes free.** `onPresent`, `onExitPresenting` and
`onActivate` are `() => undefined` today — a story claiming buttons that do
nothing — and `presenting` is a prop standing in for a mode. All four become
real.

**`authoringDisabled` stays a boolean prop.** ADR 0052 permits public inputs, and
a boolean into a boolean prop is one. Deriving it would make the harness own
`creatingAlias`, which 0052 does forbid.

**`newGraphId` is injected at composition, deterministically** (ADR 0016). A
story that mints from the ambient generator is not reproducible, and nothing in
the story reads the id. `packages/app/test/minting.ts` is the precedent.

**elkjs is not a cost.** `elk-strategy.ts:29` constructs one module-scope
`new ELK()` at import and `elkStrategy()` returns a closure; the module the
fixture already imports pulls that in today. Nothing runs a strategy — the story
renders `workspace-canvas-stand-in`.

`RetryableWorkspaceSidebarFixture` already opens a real session and reads
`state.working` through `createWorkingSpaceReader`; Navigation composes over the
same reader rather than a second one.

## Evidence

Both halves, per ADR 0052.

**Ladle**, in `packages/app/ladle-e2e/`: on `Settled`, the Graphs group is exactly
Long, Mid and Short, and Echo is absent. Then select Collection 2 and assert Echo
is the active Graph and Long is gone. Both assertions fail against the fixture as
it stands — observe that before fixing it.

**Application**: drift 2 already has its pair —
`packages/app/test/navigation.test.ts:123`, *"selects a renderer and its active
Graph without changing the Space"*, which asserts `activeGraphId: GRAPH_TWO`
after selecting a Layout. Cite it rather than writing a second. For drift 1,
check whether `canvas-projection.test.ts` already pins
`visibleGraphs === renderer.subject.graphs`; cite it if so, add it if not.

## Acceptance criteria

- [ ] The fixture composes `createRendererResolver` and `createNavigation`; no Graph list, Active Graph or selection handler is derived in it.
- [ ] `onPresent`, `onExitPresenting` and `onActivate` are Navigation's; `presenting` is read off `mode`.
- [ ] `authoringDisabled` remains a prop, and no other prop is turned into derived state.
- [ ] `newGraphId` is deterministic and injected once at composition.
- [ ] The two Ladle assertions were seen failing before the fix and pass after.
- [ ] Each claim names its application pair, cited by file and test name.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass, with real output quoted.

## Decided — do not re-open

- **No pure module for the two values.** Rejected above: it fixes one drift, reproduces `selectRenderer` by hand for the other, and would be a seam with one caller.
- **The fixture does not compose `createApp`.** Six hooks in `App` are ordering-dependent — `moves()`'s render-time call, the `addCardMenu` focus restore, `lastOpenedCardId`, `key={replacementEpoch}`, `selectCanvasRenderer`'s empty dep array and `creatingAlias`'s four readers — and `docs/agents/rendering.md` records why. Navigation is the collaborator this surface needs; the composition is not.
- **A shared story harness is not built here.** Issues 03, 05, 06 and 07 of the design-system baseline will each want session-plus-resolver-plus-Navigation, and that is when a shared harness earns its place — with the second caller, not the first.

## Answer

Implemented in `9f6a19a`. `WorkspaceSidebarFixture` now composes the production
renderer resolver and Navigation, subscribes through `useSyncExternalStore`, and
takes renderer selection, visible Graphs, Active Graph, activation, presenting,
and exit behavior from those collaborators. The retryable fixture supplies one
stable live-Space callback over its existing `createWorkingSpaceReader`, so the
rendered Space and Navigation share the same translation. `newGraphId` is
deterministic and injected once; `authoringDisabled` remains a direct boolean
input.

TDD evidence: the new Ladle assertion failed first because Echo appeared while
Collection 1 was selected. It then passed and additionally proves Collection 2
opens with Echo active, Graph activation is real, and presenting enters and
exits through Navigation. Its application pairs are cited beside the test.
Final verification: `pnpm verify` passed, `pnpm e2e` passed all 97 tests, and
`pnpm e2e:ladle` passed 9 tests. The review's one partial finding about a second
Space reader was fixed; final Standards and Spec reviews reported no findings.
