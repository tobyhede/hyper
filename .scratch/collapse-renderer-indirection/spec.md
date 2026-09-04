# Collapse the renderer indirection

Status: ready-for-agent

Source: architecture review of branch `21-layout-only-canvas-selection`, 2026-09-03, followed by a design grilling session. Follows ADR 0079, which made an authored Layout the only selectable canvas context.

## Problem Statement

A Layout is the only thing that draws the canvas. ADR 0079 settled that, and tickets 01–03 built it: Computed Views left the domain, `defaultLayout` became the persisted opening selection, and obsolete canvas identities became invalid input.

The code has not caught up. `packages/app/src/renderer.ts` and `packages/app/src/canvas-renderers.ts` are the residue of the discriminated View-or-Layout union that `.scratch/architecture-review/2026-08-12-intake-renderer-deepening-handoff.md` built. With one arm of that union gone, what remains is fifteen exported names across two modules that stand between a Layout id and the Layout it names.

Concretely, a reader following the canvas from the Sidebar to the projection meets: a `ResolvedRenderer` that wraps `@project/graph`'s `ResolvedLayout` in two more fields; a `RendererSubject` whose `graphs` field is `layout.graphs` copied verbatim; a `checkSubject` that walks the subject asserting invariants intake already guarantees; a `canvasRendererKey` that is the identity function on a UUID; a `sameRenderer` that is `===`; a `CanvasRenderer` row type carrying the two fields of a Layout the Sidebar happens to draw; a `currentRenderer` that re-finds a Layout the resolver already resolved; and a `ResolveRenderer` function type injected through two constructors that no test ever substitutes.

The cost is not the line count. It is that "renderer" is a render-layer word wrapped around a module that has never known rendering exists, and the domain word for what it resolves — Layout — reaches none of it. An agent or reviewer asked to change how a Layout draws has three plausible places to look and no way to tell which is load-bearing. The vocabulary guard that would normally catch this is itself out of date: its fixture pins a `RendererGroup` component renamed a commit ago and a `currentRenderer` call this work deletes.

## Solution

Collapse the two modules into one, named and shaped for what the code actually does, and then sweep the vocabulary that surrounds it.

The module has exactly three jobs: apply the default-Layout fallback, check the named Layout exists, and derive the Placement material — the Space's own Card objects the Layout places, and the strategy that positions them. It answers with `@project/graph`'s `ResolvedLayout` unchanged. There is no new value type, because there is no new concept: this is `ResolvedLayout` plus two derivations, not a second kind of Layout.

Afterwards, `selectedLayoutId` sits beside `activeGraphId` in Navigation, `data-layout` marks a Layout row, and the naming guard holds every retired spelling so the indirection cannot grow back.

## User Stories

1. As an agent asked to change how a Layout draws, I want one module between a Layout id and the Layout it names, so that I do not have to read three modules to find the load-bearing one.
2. As an agent reading `packages/app`, I want the module that resolves a Layout to be named for Layouts, so that the domain word ADR 0079 settled reaches the code that implements it.
3. As a reviewer, I want the resolution module to expose only names with callers, so that I can tell an interface from a leftover.
4. As an agent, I want `resolveLayout` to answer `@project/graph`'s `ResolvedLayout`, so that I learn one resolution shape rather than two that differ by two fields.
5. As an agent, I want the Cards a Layout places to come from one named operation, so that two call sites cannot derive membership differently.
6. As an agent, I want no aggregate struct bundling Cards, Graphs and strategy, so that no consumer receives material it does not read.
7. As an agent reading `canvas-projection.ts`, I want the Layout's Graphs read off the Layout, so that no copied field can drift from its source.
8. As an agent reading `App.tsx`, I want the positioned strategy built where it is used, so that its single consumer is visible from its construction.
9. As an agent constructing Navigation, I want it to import the resolver it needs, so that I am not handed a parameter no caller ever varies.
10. As an agent constructing Space Authoring, I want the same, so that composition states dependencies that are real.
11. As an agent reading `compose-app.ts`, I want it to name only the collaborators and the nondeterminism it must inject, so that the composition reads as the dependency graph it is.
12. As an agent, I want one error for a Layout that cannot be resolved, so that I do not carry a reason union whose second arm has no thrower.
13. As an agent, I want the error to say it is about a Layout, so that its name survives the rename that follows.
14. As an agent, I want the function that unwraps the Space's default Layout to be named distinctly from the persisted field it reads, so that the two do not shadow each other in files that use both.
15. As an agent editing the Space Sidebar, I want it to receive Layouts and the selected Layout, so that it draws the domain entity rather than a row type invented for it.
16. As an agent editing `App.tsx`, I want it to hand the Sidebar the Layout it already resolved, so that nothing re-finds what is already in hand.
17. As an agent, I want row identity compared by Layout id, so that the rule is legible without following an identity function.
18. As an agent reading Navigation state, I want `selectedLayoutId` beside `activeGraphId`, so that the two ids the canvas turns on are spelled the same way.
19. As an agent, I want `CanvasRendererId` replaced by `LayoutId` from `@project/core`, so that it sits beside `CardId` and `GraphId` and one spelling serves every consumer.
20. As an agent inspecting the DOM, I want a Layout row marked `data-layout`, so that what the attribute names matches what the element is.
21. As an agent writing a test, I want the Layout row's test id to name a Layout row, so that a selector reads as its target.
22. As an agent, I want React Flow's own `EdgeLabelRenderer` and `flow__renderer` left alone, so that foreign vocabulary is not swept into ours.
23. As an agent, I want `SpaceAppRenderer` left alone, so that a name describing React rendering is not renamed for describing rendering.
24. As an agent, I want every retired spelling recorded in the naming guard, so that the indirection cannot return unnoticed.
25. As an agent, I want the guard's own fixture to pin names that exist, so that the guard proves something about the current tree.
26. As a reviewer, I want the shape change and the naming sweep in separate tickets, so that I can read a behaviour-preserving diff without a rename obscuring it.
27. As a reviewer, I want the naming sweep to contain no behaviour change, so that I can review it by reading the scan rather than the diff.
28. As a person authoring a Space, I want selecting a Layout to work exactly as before, so that a refactor costs me nothing.
29. As a person authoring a Space, I want Add Layout, Rename and Delete to behave exactly as before, so that the Sidebar's prop change is invisible to me.
30. As a person authoring a Space, I want focus to return to the Layout row after a rename, so that the attribute rename does not break the keyboard path.
31. As a person presenting a Graph, I want traversal unchanged, so that Navigation losing a constructor argument changes nothing I can see.
32. As a person opening a product URL, I want the addressed Layout to open as before, so that destination resolution is untouched.
33. As an agent, I want `pnpm e2e` to pass without an edit through the two shape tickets, so that their behaviour-preservation is proven rather than asserted; the naming sweep edits four specs' selectors and nothing else.
34. As an agent, I want `SpaceApp.test.tsx` to pass without an edit, so that the composed app is evidence and not a casualty.
35. As an agent, I want the Ladle Sidebar spec to pass without an edit, so that only the fixtures behind it move.
36. As an agent, I want the module test to state the ordering guarantee for a Layout's Cards, so that a future change cannot silently reorder the canvas.
37. As an agent, I want one module test file rather than two, so that the seam and the module agree.
38. As an agent, I want the Sidebar's identity pin retargeted rather than deleted, so that the rule it holds outlives the mechanism it named.
39. As an agent, I want `CONTEXT.md` untouched, so that a refactor that introduces no concept introduces no glossary entry.
40. As an agent, I want `AGENTS.md`'s package description to describe the module that exists, so that the read-before-touching guidance stays true.

## Implementation Decisions

**One module replaces two.** `packages/app/src/renderer.ts` becomes `packages/app/src/layout-resolution.ts`; `packages/app/src/canvas-renderers.ts` is deleted. The new module exports four names:

- `requireDefaultLayout(space)` — answers the Space's `defaultLayout`, throwing when it has none. Named to say it throws, and to stop shadowing the persisted `defaultLayout` field that `space-authoring.ts` reads four lines away from calling it.
- `resolveLayout(space, layoutId?)` — answers `@project/graph`'s `ResolvedLayout`, defaulting through `requireDefaultLayout` and throwing when the id names nothing.
- `layoutCards(space, layout)` — answers the Space's own `Card` objects for the Layout's members, in `space.cards` order.
- `LayoutNotFoundError` — one error class, no `reason` field.

**No aggregate value type.** `ResolvedRenderer` and `RendererSubject` are deleted rather than renamed. Three names were tried and rejected in the design session — `DrawnLayout`, `SelectedLayout`, `PlacedLayout` — each failing because it makes an adjective of something the Layout does or has done to it, and no such concept exists. The value was `ResolvedLayout` plus two derived fields; `@project/graph` already names that shape correctly. The three production reads want different subsets, so a struct bundling them forces every consumer to receive material it does not read.

**`subject.graphs` is deleted, not moved.** It was `layout.graphs` copied verbatim. Its five readers — `navigation.ts`, `canvas-projection.ts` and three story fixtures — read `layout.graphs` directly.

**`strategy` moves to its one consumer.** `App.tsx` builds `positionedStrategy(Placement.fromLayout(layout))` itself, importing both from `@project/graph` as the module did. Two story fixtures and the two projection tests read it off the aggregate today and build their own the same way. The Placement is consequently built twice per render — once inside `layoutCards`, once at that call site. That is a Map build over one Layout's Cards, accepted deliberately over a struct that exists only to share it.

**`checkSubject` is deleted with the `'invalid-subject'` reason.** It asserted that each subject Card and Graph is the Space's own object and unduplicated. Intake already rejects duplicate Card, Graph and Layout ids, and the subject was built by filtering `space.cards` and reading `layout.graphs` — the Space's own objects by construction. It was exported for a caller that never existed. With one reason left, `RendererInvariantReason` goes and the error class loses its `reason` field, which nothing reads.

**`canvasRendererKey` and `sameRenderer` are deleted.** Both are identity functions on a UUID. The rule `canvasRendererKey` encoded — that a structurally equal row built by a second derivation still presses — survives as `===` on the Layout id.

**The `ResolveRenderer` injection is dropped.** Navigation and Space Authoring import `resolveLayout` directly instead of receiving it, and so does the **story-support navigation module**, which is a second injection site: it takes the resolver as a parameter of `composeStoryNavigation`, constructs one in `useStoryNavigation`, and returns it. Two further story fixtures construct one directly. `createRendererResolver()` took no arguments and no test ever substituted the function, so it was a hypothetical seam with one implementation. ADR 0016 governs injecting nondeterminism; a pure resolver is not that, so nothing requires the injection. `compose-app.ts` stops constructing and threading it. `newId` remains injected exactly as before.

**The Card-collection prop keeps its meaning and loses its name.** `SpaceCanvas` and Edge Authoring take `subjectCards`, doc-commented as the Cards the renderer's subject holds. With the subject deleted the name points at nothing, so the naming sweep renames it — which edits `SpaceCanvas.test.tsx` and `edge-authoring-react.test.tsx`, two files no other part of this work touches, and edits them for the prop name only.

**Ticket 03 renames what it retypes; ticket 04 owns the rest.** Deleting `ResolvedRenderer` changes the type of every parameter and local bound to it — in Navigation, the projection and the composition — so those bindings are renamed with the retype rather than left spelled for a deleted type through a ticket. The clean line is not "shape, then names": it is "names the type change forces, then names it does not".

**The Sidebar takes domain entities.** `SpaceSidebarProps.canvas` carries `layouts: readonly Layout[]` and `selected: Layout` in place of `renderers: CanvasRenderers` and `current: CanvasRenderer`. `App.tsx` passes the Layout it already holds from `resolveLayout`, so nothing re-finds it. `SidebarEntity`'s `renderer` field becomes `layout: Layout`. The Sidebar receives `positions` and `graphs` it does not read; that is accepted over inventing a row type.

**`LayoutId` joins `@project/core`.** `packages/core/src/types.ts` gains `export type LayoutId = Layout['id']`, beside the `CardId` and `GraphId` that already follow that pattern and below the `Layout` it derives from. It replaces `CanvasRendererId` at every site.

**Navigation state renames its field.** `selectedRenderer` becomes `selectedLayoutId`, symmetric with the `activeGraphId` beside it in the same interface. `continueInRenderer` becomes `continueInLayout`, `selectRenderer` becomes `selectLayout`.

**The DOM hooks rename.** `data-renderer` becomes `data-layout`, including the focus-restoration query `App.tsx` runs after a rename. `data-testid="canvas-renderer"` becomes `data-testid="layout-row"`. `SelectedCanvasRenderer` becomes `SelectedLayoutName`. `data-testid="selected-canvas"` stays: "canvas" is live domain vocabulary and that element names what is drawing the canvas.

**Three names are foreign and stay.** React Flow's `EdgeLabelRenderer` and its `flow__renderer` class, and `SpaceAppRenderer` — a function type that genuinely renders a React element.

**A fourth name stays for a different reason.** The parity claim `space-sidebar-marks-one-current-renderer` is a hyphenated tag shared by an e2e spec and the Ladle spec. The guard reads identifier shapes and does not see it, and renaming it would edit the Ladle spec this work promises not to touch. It is recorded here so the next reader does not reopen it.

**The naming guard learns the retired spellings.** `test/unit/current-domain-vocabulary.test.ts` gains `ResolvedRenderer`, `RendererSubject`, `CanvasRenderer`, `CanvasRendererId`, `canvasRendererKey`, `currentRenderer`, `canvasRenderers`, `selectedRenderer`, `data-renderer` and `canvas-renderer`. Its `HISTORICAL_TREES` already excludes `.scratch/`, `docs/adr/` and `docs/superpowers/`, so this spec and the ADR record may name them.

**`CONTEXT.md` does not change.** No concept is introduced. Three documents do: `AGENTS.md`'s `app` package description in the three sentences describing the deleted interface, `docs/agents/rendering.md` where it says the projection reads the resolved renderer's subject, and `docs/agents/ui.md`'s Sidebar bullet.

## Testing Decisions

A good test here proves external behaviour and, for a behaviour-preserving refactor, the strongest test is one that does not change. Two suites are evidence precisely because they are untouched: if either needs an edit, the refactor changed behaviour it should not have.

**No new seams.** Every seam already exists; three change shape.

`pnpm e2e` — the top seam, Playwright over HTTP against a real Vite host, covering Layout selection, Add Layout, Rename, Delete, presenting and product-URL opening. **Not one line changes through tickets 02 and 03**, which is where the behaviour-preservation evidence lives. Ticket 04 renames the Layout row's test id, which `overview.spec.ts`, `space-routing.spec.ts` and `editing.spec.ts` select on; those take selector-only edits, no assertion or step changes. The alternative — keeping the retired test id so the suite stays untouched — is rejected: a spelling the guard cannot hold is a spelling that grows back.

`packages/app/test/SpaceApp.test.tsx` — the highest unit-land seam, driving the composed app through `createApp`. Not one line changes.

`packages/app/ladle-e2e/issue-14-space-sidebar.spec.ts` — Sidebar story behaviour. The spec does not change; the story fixtures behind it move to the new props.

`packages/app/test/renderer.test.ts` and `packages/app/test/canvas-renderers.test.ts` merge into `packages/app/test/layout-resolution.test.ts`. Same seam, narrowed to the four surviving names. It proves: `requireDefaultLayout` throws on a Space with no default; `resolveLayout` throws `LayoutNotFoundError` on an id naming nothing; `resolveLayout` with no id answers the default Layout; and `layoutCards` answers the Space's own Card objects, for the Layout's members only, in `space.cards` order. That ordering guarantee earns a direct test because no higher seam states it. Prior art: the two files being merged.

`packages/app/test/SpaceSidebar.test.tsx` — component seam unchanged. The pin at "presses an equal row that a second derivation built" retargets from `canvasRendererKey` to `===` on the Layout id; the rule it holds is kept, and its docstring is rewritten to name the surviving mechanism.

`test/unit/current-domain-vocabulary.test.ts` — the seam that makes this durable. Its retired list grows, and its **negative self-test inverts**. That block is a fixture for the pattern, not a claim about the tree: it holds the lines the scan must stay *silent* on, proving the retired entries do not over-match the names that replaced them. It is correct today — an entry naming a since-renamed component is dead weight, not a false claim — and it is what breaks when the list grows. Four of its lines name spellings this effort retires and move to the arm that asserts the scan *reports* them. One rule changes as well: `SelectedCanvas` is matched as a whole identifier precisely so `SelectedCanvasRenderer` does not match, so retiring the longer name means editing that lookahead rather than adding an entry. Prior art: the ADR 0041 Graph rename, whose retired-name entries this follows exactly.

`docs/agents/ui.md` — not a test, but the file the scan will report if it is missed. Its Sidebar bullet names `SelectedCanvasRenderer`, `canvasRenderers`, `currentRenderer` and `layoutNotFound`, and it is the read-before-touching authority for the surface ticket 02 changes. The ADR 0055 guard exists because this same document went stale on the last rename.

`packages/app/test/story-spaces.test.ts` — a second consumer of the deleted row derivation and find, which asserts where each story Space opens by reading the current row's title. It is not the deleted module's own test file, so it is easy to miss; it asks the Space for the Layout instead, and takes the renamed default accessor.

**Seams deliberately not touched.** `navigation.test.ts`, `space-authoring-operations.test.ts`, `space-authoring.property.test.ts` and `compose-app.test.ts` lose a constructor argument — a call-site edit, not a seam change. `canvas-projection.test.ts` and `canvas-projection.property.test.ts` read `layout.graphs` where they read `subject.graphs` — also a call-site edit. No test is added at any of them.

**Coverage.** Thresholds are pinned per-package for `core`, `graph` and `persistence` only. `app` has none, so deleting `app` code threatens no threshold. `core` gains one type alias and no statement.

**Bars.** `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle`, each reported with real output. `e2e:ladle` is required because `SpaceSidebar` has stories and its props change; it is in neither `verify` nor `e2e`, so nothing else runs it. No PostgreSQL run: no stored, imported, exported or HTTP shape changes.

## Out of Scope

ADR 0079 ticket 04 — a Space Card selecting a Layout and a Graph. It is tracked at `.scratch/layout-only-v1/issues/04-make-space-cards-select-initialized-layouts.md` and is unaffected.

Any change to `@project/graph`. `ResolvedLayout`, `SpaceLookup`, `Placement` and `positionedStrategy` are consumed exactly as they are. Growing `ResolvedLayout` to carry Cards and a strategy was considered and rejected: `lookup` builds one per Layout eagerly, so it would make intake O(Layouts × Cards) and put a strategy construction inside the identity index, and `space-authoring.ts` wants identity only.

Any new domain term, and therefore any `CONTEXT.md` edit.

Any behaviour change. Not a pixel, not a keystroke, not a URL.

Any change to the render adapter's `none | card | edge` canvas selection, to Edge Authoring's lifecycle, or to the projection's own shape beyond reading `layout.graphs`.

Any new ADR. ADR 0079 already decided that a Layout is the only canvas context; this brings the code into line with a decision already accepted.

## Further Notes

`.scratch/architecture-review/2026-08-12-intake-renderer-deepening-handoff.md` is the handoff that built the module being collapsed, and reading it explains the shape: `ResolvedRenderer` was a discriminated union of a View renderer and a Layout renderer, `RendererSubject` existed because a View selected the whole Space while a Layout selected its members, and `checkSubject` guarded a conversion boundary that no longer exists. Every name this spec deletes was load-bearing then. None is now.

The 2026-08-12 handoff also recorded a deliberate exception: the canvas projection kept reading fallback Cards rather than `renderer.subject.cards`, deferred to the ticket that removed the fallback band. That band is gone, and `canvas-projection.ts` now reads the subject — so `layoutCards` is the settled version of that deferral, not a reopening of it.

`packages/app/src/App.tsx` carries fifteen distinct identifiers built on the retired word, and `selectedRenderer` alone appears seventy-two times across the package. The sweep is mechanical but large, which is why it is a separate ticket from the shape change: a reviewer should be able to read the collapse without a rename running through it, and read the rename as a scan rather than a diff.
