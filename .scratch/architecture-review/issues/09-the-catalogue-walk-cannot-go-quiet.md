# The catalogue walk cannot go quiet

Status: ready-for-agent

Surfaced by: the 2026-08-21 architecture review's first candidate, then cut down
by verification. Two of the three defects the review reported were wrong or
already fixed; what is below is what survived being checked against the committed
tree at `0db6e1e`.

Blocked by: None.

## What the review got wrong, so it is not re-argued

- **`RoutedEdge.tsx` is not a false green.** It carries an entry in
  `uncataloguedComponents` (`design-system-inventory.ts:97`). The review read a
  truncated probe and reported that a component with no story evidence passes the
  gate. Nothing does.
- **The type-only gap is already closed.** `0db6e1e` made `moduleReferences` skip
  both spellings — the whole declaration and the individual specifier — through
  `phaseModifier`, with a comment naming the hazard: "a story could catalogue a
  component by mentioning its props type." The review was reading the pre-commit
  working tree.

## The defect

`buildUiCatalog` answers "which production modules does a stable story render"
with an import-graph walk. `barrelOwners` (`scripts/ui-catalog.ts:502`) resolves
a story's imports back through a package index **by the names the story took** —
deliberately, because following an index whole "would mark every module in that
package rendered by whichever story imports one name from it"
(`scripts/ui-catalog.ts:492`, and the argument is restated in
`.scratch/design-system-baseline/issues/08`). That constraint is right and stays.

Two things fall through it.

**A name the index declares itself resolves to nothing.**
`packages/react-flow-adapter/src/index.ts:20` declares `nodeTypes` as a local
`const` over `CardNode`, rather than re-exporting it from a module.
`stories/support/ReactFlowCanvas.tsx:4` takes `{ nodeTypes, edgeTypes }` and
mounts them into a real `ReactFlow` (`:82-97`), rendered from the stable
`canvas-card.stories.tsx` story. `barrelOwners` finds no reference in the index
whose names intersect `nodeTypes`, so `CardNode.tsx` counts as unrendered.

Its inventory entry (`design-system-inventory.ts:92`) then reads:

> Catalogued through what it draws rather than as itself.
> `canvas-card-hover-reveals-actions-and-handles-together` mounts the real
> `CardNode` inside a real `ReactFlow` …

That sentence is true, and it is the checker being wrong. Every other entry in
the list is a property of the component — "no still state to render",
"deliberately without a consumer". This one is a property of the script, and
nothing distinguishes the two kinds to a reader.

**`export *` is skipped whenever names are wanted.** A star export's `names` is
`null`, and `barrelOwners`' filter is `reference.names?.some(...)`, which is
falsy for `null`. `packages/react-flow-adapter/src/index.ts:5-6` uses `export *`
twice. Latent today — both targets are `.ts`, so no production component is
hidden — and silent by construction if that changes.

Both are the failure mode the file already legislates against, twenty lines from
where the gate runs: *"Nothing here may go quiet by going missing: an empty
directory scan and an absent stylesheet both look exactly like a clean tree"*
(`scripts/ui-catalog.ts:786`).

## What to build

### 1. An unresolvable wanted name is a problem, not a miss

When a caller takes a name through a package index and `barrelOwners` resolves it
to no module at all, report it. One rule catches both cases above and every
future one, and it converts a silent over-approximation into a failing check that
names the barrel and the name.

This half stands on its own and is worth landing first.

### 2. Then resolve the composed declaration — and settle the turn in it

Following a locally-declared value back to the modules its declaration references
would resolve `nodeTypes` → `CardNode` and delete that inventory entry, which is
this ticket's acceptance test.

**It has a turn in it that must be decided, not discovered during
implementation.** `ReactFlowCanvas.tsx:4` takes `nodeTypes` **and** `edgeTypes`
in one import, and every stable story passes `edges={[]}` (`:151`). The only
fixture that draws Edges, `SelectedEdgeCanvasFixture`, is reached solely from a
`stories/review` story and mounts `AuthorableEdge` rather than `RoutedEdge`
(`:46`). So the same fix that stops `CardNode` being wrongly excluded would start
counting `RoutedEdge` as rendered when nothing draws it — turning a correct entry
into the false green the review mistakenly reported.

Three ways out, none obviously right:

- The harness stops importing an `edgeTypes` it never draws, so its imports mean
  what the checker reads them to mean. Then `RoutedEdge` needs an inventory
  reason that is a design fact, and "no stable story draws an Edge yet" is a gap
  rather than a design fact.
- A stable story draws a routed Edge. The fixture already runs a real strategy
  over a real projection, so this is real evidence rather than a facsimile, and
  ADR 0052 would prefer it.
- Registration counts as rendering, and the relation is honestly named as
  "reachable" rather than "rendered".

Grill this before writing the resolution.

### 3. A real-tree assertion

Every one of the 29 tests in `test/unit/ui-catalog.test.ts` runs against a
synthetic tmpdir repo, which is how both gaps shipped green. Add one case that
pins the tricky modules against the real tree — `CardNode` resolves as rendered,
and whatever §2 settles for `RoutedEdge` — so the *relation* has a regression
guard rather than only the fixture grammar.

## Acceptance criteria

- [ ] A wanted name that resolves through a barrel to no module fails `pnpm ui:catalog:check`, naming the barrel and the name.
- [ ] `export *` is either followed correctly or reported by that rule; it cannot be silently skipped.
- [ ] `CardNode.tsx`'s entry is gone from `uncataloguedComponents`, deleted by the checker resolving it rather than by hand.
- [ ] `design-system-inventory.ts` contains no reason that describes what the checker cannot see; every entry is a property of the component.
- [ ] `RoutedEdge`'s treatment matches whatever §2 settles, and the reason recorded for it is a design fact.
- [ ] One test asserts the relation against the real tree, not a tmpdir fixture.
- [ ] `pnpm verify` passes, with real output quoted. `pnpm e2e:ladle` too if a story changes.

## Decided — do not re-open

- **The static gate stays in `pnpm verify`.** Issue 08 of the design-system
  baseline chose it and its Answer says so: "`pnpm verify` retains the static
  gate. Application and Ladle E2E remain separate runtime commands." Replacing
  import-reachability with what the browser observed during `e2e:ladle` is
  feasible — Playwright's `page.coverage` is already available, the suite is
  Chromium-only, and Ladle serves unbundled ESM whose module URLs carry absolute
  repo paths — but it costs a CI artifact hand-off that `.github/workflows/ci.yml`
  has deliberately never needed, and neither surviving defect is an argument for
  it.
- **Following a barrel whole is still wrong.** The by-names filter is the thing
  that stops one `Button` import cataloguing all of `@project/ui`. Any resolution
  in §2 follows what a declaration actually references, never every local import
  of the index — the crude version would mark `RoutedEdge` rendered through the
  same door this ticket is trying to close.
- **`design-system-inventory.ts` records design facts only.** A reason that
  describes a limit of the walk is a defect to fix, not an entry to keep.
