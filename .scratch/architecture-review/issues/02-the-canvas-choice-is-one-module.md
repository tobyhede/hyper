# The canvas choice is one module

Status: resolved

Surfaced by: architecture review of `feat/issue-02-workspace-menubar` against `main`
(candidates A and D). The design was settled by a grilling loop; the rejected
alternatives are recorded under "Decided" so none is re-opened.

Blocked by: `design-system-baseline/issues/14` (PR #76) merging to `main`. This
starts on a fresh branch from updated `main`, not on top of that one.

## What to build

ADR 0053 decided the canvas takes **one** choice. The code draws it correctly and
computes it three times: `App.tsx` builds the two lists, `WorkspaceSidebar`
decides which row is pressed, and `CurrentCanvas` derives the same title down a
second path off `renderer`. `WorkspaceSidebarFixture` writes a fourth copy by
hand. One module answers it once, and the header takes what the list was built
from.

This is a **locality** change, not a leverage one. The implementation is a small
mapping; what it buys is that no caller can derive the choice a second way. Size
it accordingly — it is not a deep module and should not be grown into one.

## The module

`packages/app/src/canvas-choice.ts`. Pure: no React, no DOM, no strategy.

```ts
/** One thing the canvas can draw. */
export interface CanvasRenderer {
  readonly selection: RendererSelection;
  readonly title: string;
}

/** The one choice over everything the canvas can draw (ADR 0053). */
export interface CanvasChoice {
  readonly computed: readonly CanvasRenderer[];
  readonly authored: readonly CanvasRenderer[];
  /** Reference-identical to one row in `computed` or in `authored`. */
  readonly selected: CanvasRenderer;
}

export function canvasChoice(space: Space, selected: RendererSelection): CanvasChoice;
```

- `computed` is built **once at module scope** from `BUILT_IN_VIEW_IDS` and
  `builtInViewTitle`, and the same frozen array returns from every call. It reads
  nothing from the `Space`, so it does no per-call work.
- `authored` maps `space.layouts`, in that order.
- `selected` is reference-identical to one row. That identity is part of the
  interface, not an implementation detail: it is how the sidebar decides which
  row is pressed.
- A `selected` naming a Layout the Space no longer holds throws
  `RendererInvariantError('renderer-not-found')` — the same answer
  `resolveRenderer` already gives to the same condition, which it documents as a
  caller defect rather than an author's mistake. Two modules answering one
  condition two ways is the disagreement this ticket removes.
- `builtInViewTitle` and `rendererSelectionKey` stay in `renderer.ts`. The first
  belongs beside the title, strategy and policy of the View it names; the second
  describes a `RendererSelection` and not a list.

## What changes

**`WorkspaceSidebar.tsx`.** The `canvas` props become
`{ choice: CanvasChoice, onSelect: (selection: RendererSelection) => void }` —
one field rather than three, so a caller cannot supply a `selected` that is not
one of the rows. The pressed row is `row === canvas.choice.selected`.
`rendererSelectionKey` still supplies React's key and the test id.
`VIEW_ICONS` stays here, keyed by `BuiltInViewId` under `satisfies`: exactly one
module draws a row today, so moving the glyph beside the strategy and title would
open a seam nothing crosses, and would make a pure module import `@project/ui`.

**`CurrentCanvas` becomes `SelectedCanvas`**, stays in `WorkspaceSidebar.tsx`,
and takes one `CanvasRenderer`. This is the load-bearing edit: while the header
can be handed a bare `title`, `App` can still pass `renderer.title` and the
defect returns on the next change.

**`App.tsx`.** `computedChoices` and `authoredChoices` are deleted, replaced by
one `useMemo(() => canvasChoice(rendererSpace, selectedRenderer), [rendererSpace, selectedRenderer])`,
matching `projection`'s memo directly above it. The header takes
`choice.selected`. `onSelect` hands the selection straight through.

**One naming question left open.** ADR 0031 says Views and Layouts are
*selected*; ADR 0053 says the canvas takes one *choice*; `App.tsx` already holds
`chooseRenderer`, which calls `navigation.selectRenderer`. The field and the
component follow the verb `onSelect` (above). Whether `chooseRenderer` is renamed
with them is deliberately not settled here: it resolves the renderer, calls
`navigation.selectRenderer` **and** writes the render adapter, so it is not the
operation it delegates to, and `selectRenderer` calling `navigation.selectRenderer`
reads worse rather than better. Decide it in the change, and say which way in the
comments below.

**Tests.** A new node-environment `packages/app/test/canvas-choice.test.ts` owns
the derivation: both groups, their order, `selected`'s reference identity, and
the throw. `WorkspaceSidebar.test.tsx` keeps only what the sidebar draws — one
pressed row across both groups, no row reading `None`, the empty-group text — and
continues to build its rows by hand, because a test of a list must not need a
`Space`. `forwards the chosen row whole` becomes `forwards the selection`.

**Test ids.** `canvas-choice` → `canvas-renderer`; `current-canvas` →
`selected-canvas`; `current-canvas-kind` → `selected-canvas-kind`. They appear in
`WorkspaceSidebar.tsx`, `WorkspaceSidebar.test.tsx`, `e2e/graph.ts`,
`e2e/overview.spec.ts`, `e2e/editing.spec.ts` and
`ladle-e2e/issue-14-workspace-sidebar.spec.ts`. Leave a test id behind and the
name and the test surface disagree, which is the fault being removed.

## The story fixture

ADR 0052 makes the stable stories production-parity evidence, and
`WorkspaceSidebarFixture` currently *transcribes* that parity: four `Graph`
literals with hex colours copied from `GRAPH_PALETTE`, two Layout rows, and a
comment stating they mirror `fixture/space.json`. Parity held by a comment is the
defect.

New `packages/app/stories/support/spaces.ts` exports two loaded `Space` values:

- **`authoredSpace`** — `loadSpaceSnapshot` over a `SpaceSnapshot` literal. Keep
  the present titles (`Collection 1`, `Collection 2`, `Long`, `Mid`, `Short`,
  `Echo`) so the Ladle specs do not churn. **Drop the hex colours**: a Graph
  carrying no colour takes a palette slot by order from `graphColorMap`, which
  yields the same blue, amber, green and pink. Drop the mirroring comment.
- **`unauthoredSpace`** — `loadSpace(newSpace())`. `newSpace()` in
  `@project/graph` is the one encoding of ADR 0018, and a hand-written snapshot
  would be a second. It returns the on-disk shape, so this is `loadSpace` rather
  than `loadSpaceSnapshot`, and it mints fresh ids on each page load — no story
  and no spec reads an id.

Colours come from `graphColorMap(space)` directly, never through
`canvasProjection`: that path needs a resolved strategy and would run elkjs in a
story about a sidebar.

`WorkspaceSidebarFixture` takes `space: Space` with `authoredSpace` as the
default. The `unauthored` boolean goes, and the Unauthored story passes
`space={unauthoredSpace}`.

`RetryableWorkspaceSidebarFixture` keeps `retrySnapshot` for its session and
draws the shared authored Space. **Write the comment saying why**: the sidebar in
that fixture reads only `persistence`, `acknowledgedRevision` and `retry` from
the session and never its working Space, so one value doing both would suggest a
link the code does not have. Making that link real is issue 03.

## Acceptance

- [x] `canvasChoice` is the only place either group is built, and `App.tsx` builds neither.
- [x] The canvas header takes `choice.selected` and derives no title from `renderer`.
- [x] `selected` is reference-identical to one row, and the sidebar's pressed test is `===`.
- [x] A selection naming a Layout the Space lacks throws `RendererInvariantError('renderer-not-found')`.
- [x] `computed` is built once at module scope and is the same array on every call.
- [x] `WorkspaceSidebar` takes the record whole and cannot be given a `selected` outside its rows.
- [x] `canvas-choice.test.ts` runs in the node environment and owns the derivation; `WorkspaceSidebar.test.tsx` still builds its rows without a `Space`.
- [x] `stories/support/spaces.ts` supplies both Spaces, and no Graph colour, Graph title or Layout title is written in two places.
- [x] The Unauthored story is `newSpace()` through `loadSpace`, not a literal.
- [x] `RetryableWorkspaceSidebarFixture` keeps its own snapshot, with the reason written down.
- [x] Every renamed test id is renamed at every site.
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass.

## Decided, so it is not re-opened

- **Not in `renderer.ts`.** That module answers what one selection resolves to;
  this answers which selections exist and which is taken. Different questions,
  different test file, and `renderer.ts` is already 516 lines.
- **Not taking `ResolvedRenderer`.** The lists need `space.layouts` and the ids
  `core` ships; nothing here needs a strategy, and accepting one drags elkjs into
  a module whose whole value is being pure and node-testable.
- **The glyph does not move to `BUILT_IN_VIEWS`.** One adapter is a hypothetical
  seam. Revisit when a second module draws a row.
- **The computed group is not exported as a bare constant for the sidebar to
  import.** That sends the sidebar to a second source for half its list, which is
  the defect this ticket removes. It also has nowhere to put the `Space`-dependent
  answer a future View will need — CONTEXT.md's tree View, whose subject is one
  Graph's Cards, and this repo's rule that a refused choice is a disabled row
  carrying its reason rather than an absent one.
- **The catalogue does not glob the tracked `fixture/**`.** Ladle runs its own
  Vite pipeline with no space loader, so that means reproducing the Node
  directory read in the browser. It also makes the story the *same* adapter as
  e2e, losing the second input that proves the seam.
- **The record is not `CanvasChoices`** — a plural name over a record that is not
  a collection — **and not `SelectedCanvas`**, which names the record after one of
  its three fields and loses ADR 0053's word for the whole.

## Out of scope

- The hidden `persistence-status` span and the two props that feed it
  (`state`, `acknowledgedRevision`). That is candidate C of the same review, not
  yet raised as a ticket.
- The session-backed retryable fixture — issue 03.
- Any second control for the canvas choice, and merging Graph activation into the
  canvas list. ADR 0053's negative section forbids both.

## Comments

**The naming question: `chooseRenderer` keeps its name.** The ticket left this
open and asked for the answer here. The prop and the header component follow the
verb the sidebar acts in — `onSelect`, `SelectedCanvas` — while `App`'s handler
keeps `choose`, because it is not the operation it delegates to: it resolves the
renderer, calls `navigation.selectRenderer` **and** writes the render adapter.
Renamed, its body would read `selectRenderer` calling `navigation.selectRenderer`,
which says less than the current pair does. ADR 0031's *selected* names the thing
Navigation stores; ADR 0053's *choice* names the whole the author picks from; the
composed operation keeps the verb that says it composes. The reasoning is written
above the `useCallback` so the next reader does not re-open it.

**Two departures from the ticket's file list, both additive.**

`packages/app/package.json` gains `"#src/*": "./src/*.ts"`. The story fixture has
to reach `src/canvas-choice`, `src/colors` and `src/renderer`, and a story sits
two directories below the package root, so the relative path is `../../src/…` —
which ESLint's `ESCAPE_PATTERN` bans outright. This is the same need `#components/*`
already exists for, answered the same way rather than by an exemption.

`packages/app/test/edge-authoring-react.test.tsx` composes the real
`WorkspaceSidebar` and so was a fourth consumer of the old three-field props; the
ticket's list did not name it. It now builds one `CanvasRenderer` constant and
uses that very value as `selected`, which is what the reference-identity contract
asks of a hand-built record.

**`docs/agents/ui.md` updated.** It named `CurrentCanvas` as the header
component, and it is the read-before-you-touch file for this area — left alone,
an agent following it would have written the bare `title`/`kind` props back.

**Not done, and deliberately.** The `CanvasChoice` interface is structural, so a
hand-built literal whose `selected` is merely *equal* to a row draws with nothing
pressed rather than failing to compile. Branding the type would close that, and
was not done: the ticket sizes this as a locality change that "should not be
grown into" a deep module, and the two tests that build a record by hand both
name their rows as constants and reuse them. The prop docblock states the
contract rather than claiming the compiler enforces it.

**Verification.** `pnpm verify` passes except `test/unit/agent-skill-symlinks.test.ts`,
which is unrelated to this change and not caused by it: the vendored mattpocock
skills pack that commit `a0dff60` retired re-installed itself into `.agents/skills/`
mid-session without the matching `.claude/skills` symlinks. Those files are
excluded from this commit. `pnpm e2e` (97) and `pnpm e2e:ladle` (8) both pass.
