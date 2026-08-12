# Integrate and verify the version 1 aggregate

Status: resolved
Blocked by: 03, 05, 07

## What to build

Nothing new. This is where the shared branch is promised green, and where the
proofs the handoff names for package 2 are actually run rather than assumed.

Tickets `02`–`05` each leave part of the tree red on purpose: the version 1
shape has no compatibility form, so no ordering of them keeps every suite
passing along the way. That was the deliberate trade against an expand–contract
sequence, which would have bought per-commit green at the price of a
temporarily conditional closure rule — an Edge endpoint's obligation depending
on where its Graph sat. That is the exact shape of defect ADR 0045 exists to
close, so it was not worth building even briefly. The debt is paid here.

Run the whole bar, fix the fallout, and delete rather than adapt tests that
assert a shape the first-public aggregate does not have.

Three proofs are load-bearing and must exist as tests, not as observations:

1. No View output can violate closure or reuse a source Graph identity.
2. A Space carrying one Graph id in two Layouts is a named load error
   identifying both owners — not a silently shortened index.
3. The fixture's Flow view draws all four Graphs across its two Layouts.

Then reconcile the standing guidance to what is now true. ADR 0040 and ADR 0045
stop being "accepted, not built" in AGENTS.md; `CONTEXT.md`'s Layout, View,
Algorithmic View and Id entries stop describing a Space-level Graph collection;
the handoff's package 2 is marked done and its remaining packages left alone.

**The fallback band stays.** Package 5 of the handoff deletes it and builds its
replacement together. Do not take it out here because it looks vestigial.

## Green bar

`pnpm verify`, the full Playwright suite, and PostgreSQL integration — all
green, all reported with real output. `pnpm postgres:up` before the integration
run and `pnpm postgres:down` after.

**PostgreSQL is a first verification here, not a re-run.** Ticket 04 migrated
`test/integration/postgres-space-repository.test.ts` and `hyper-cli.test.ts` and
left them typecheck-clean, but could not execute them — no Docker daemon was
available in that worktree. Nothing has yet exercised the version 1 shape
against a live database: not the id minting under a Layout, not the JSONB
round-trip, not the revision check. Treat a failure here as a real defect in
ticket 04's work rather than as environment noise, and do not close this ticket
on the strength of the tests merely compiling.

## Acceptance criteria

- [x] `pnpm verify` green.
- [x] `pnpm e2e` green, including the fixture and new-space projects.
- [x] `pnpm test:integration:postgres` green against a live database, and
      PostgreSQL stopped afterward.
- [x] `pnpm e2e:postgres` green — a real edit survives a fresh Vite host on the
      version 1 shape.
- [x] The three proofs above exist as tests.
- [x] A version 2 document is rejected by name anywhere it can enter: intake,
      import, HTTP commit and the CLI. Rejection is total; see the Answer for
      where the *naming* is weaker than intake's.
- [x] AGENTS.md, `CONTEXT.md` and the implementation handoff describe the built
      state; no entry still calls ADR 0040 or 0045 unbuilt.
- [x] The fallback band and its two guards are still in place.

## Answer

Not a repair job, as expected: nothing was red on arrival, and no source module
changed. What follows is what the recording actually found.

### The three proofs discriminate — checked by mutation, not by name

Each was disabled in turn and the suite re-run, because a passing test proves
nothing about a check that isn't there.

1. **No View output can violate closure or reuse a source Graph identity** —
   `packages/app/test/view.property.test.ts` over `convertView`. Two properties:
   whatever leaves the boundary satisfies both obligations, *and* every generated
   violation throws (`fc.pre` narrows to violating outputs, so the second cannot
   pass vacuously). Disabling the fresh-identity throw fails both; disabling the
   closure throw fails both. The generator is deliberately hostile — it draws
   graph ids from the subject's own, so identity reuse is reachable rather than
   theoretical.
2. **One Graph id in two Layouts is a named load error identifying both owners**
   — `validateReferences` builds `ownerByGraphId` and the message names both
   layout ids; `packages/graph/test/validate.test.ts` asserts `ref` and both
   owners, plus a second case for one id repeated inside a single Layout.
   Neutering the owner lookup fails both. It is a *load* error because
   `validateReferences` runs inside `buildSpace`, which both `loadSpace` and
   `loadSpaceSnapshot` go through.
3. **The fixture's Flow view draws all four Graphs across its two Layouts** —
   `overview.spec.ts`'s "draws every graph at once" (4 legend items, 13 edges, 4
   distinct stroke colours) with "selecting a Layout draws the Graphs it owns and
   only those" (9/3 for `Collection 1`, 4/1 for `Collection 2`) beside it, so the
   flatten cannot be confused with either Layout's own. Making `resolveGraphs`
   answer the first Layout instead of the flatten fails it at 3 legend items.
   "selecting a graph emphasises it without hiding the others" additionally pins
   emphasis *across* the boundary: Echo, owned by the other Layout, recedes
   exactly like Long's two neighbours and stays drawn.

### The fallback band is untouched

`positionedStrategy`'s unplaced band is intact, as are both guards that stop it
becoming authorship: `Placement.next` promotes only the Cards a completed gesture
placed, and the render adapter's `syncProjection` reports rendered geometry
rather than installing it. Tests for both survive
(`placement.test.ts`, `positioned.test.ts`, `render-adapter.test.ts`). AGENTS.md's
`Placement` bullet now says the band is deliberate and names package 5 as the
only thing that may remove it, because the previous wording ("that behavior and
its tests express the superseded model") reads as an invitation to delete it.

### Version 2 rejection: total, but named twice over at the file boundary

Intake is exact — `loadSpace` reads the declared version *before* parsing and
answers one `unsupported-version` error naming it, pinned in `space.test.ts` and
again at the app import surface in `open-workspace.test.ts`. The wire and the
schemas reject it on the `version` literal.

The file importer does **not** share intake's pre-parse check: `readSingleSpace`
hands the JSON straight to `importSpaceFileSchema`, so a version 2 directory
earns the version diagnostic *and* the cascade of moved keys
(`layouts.0.graphs: Required`) — verbatim the cascade the intake check exists to
avoid. Rejection is never in doubt and nothing reaches the repository, so this is
recorded rather than repaired: giving the importer the same pre-parse check is a
second answer to "which version is supported", and deciding where that lives is
not an integration ticket's call. `test/unit/import-space.test.ts` now pins the
behaviour as it is, with the difference written beside it.

> **Superseded by ticket `08`.** That question was answered by making the gate
> one offered function — `documentRefusal` — which intake and the file
> importer both ask; the paragraph above describes the tree before it. Left
> as written, since a resolved ticket records what was true when it was.

### Guidance reconciled

- **AGENTS.md** — branch note deleted. ADR 0040 and ADR 0045 now read *built*,
  with 0040 naming the three parts that are not (the fallback band, Remove from
  Layout and the Delete-Card cascade, Graph management) and pointing at package
  5. ADR 0030's entry said version 2 four times, including that the exporter
  emits version 2 directories. ADR 0041's entry still said 0040 was unbuilt. The
  space-file key list still named a space-level `graphs`. The three Scope
  discipline paragraphs — the Layout filter, renderer resolution, and what
  `updatePositionedLayout` writes — were rewritten against `resolveView` and
  `snapshot.ts` as they now stand. The fixture paragraph gained its two Layouts
  and the ELK-seed regression test.
- **CONTEXT.md** — no edit. Every entry the ticket named was checked line by line
  against the code and already describes the built state. Its Placement entry
  says an omitted Card "is not rendered there", which the fallback band
  contradicts; that is the glossary correctly leading the code, and AGENTS.md is
  where the divergence is recorded (`docs/agents/workflow.md`).
- **The handoff** — packages 1 and 2 marked done, with package 2 pointing at the
  three proofs. Packages 3–10 untouched.
- **README.md** — not in the ticket, and wrong: its `space.json` example was
  version 2 with a space-level `graphs` array and a Layout carrying the `graphs`
  *filter* ticket `01` deleted. It is the one document a human hand-authoring a
  Space would read. Replaced with the version 1 shape and a key table that says
  what membership, ownership and id scope mean.
- **ADRs** — no edit. Nothing here supersedes or changes a decision, and a status
  line is the only edit an accepted ADR ever receives.

### Bars

All three green, run on the final tree.

- `pnpm verify` — 96 test files, 951 tests, all files 93.87% statements.
- `pnpm e2e` — 72 passed in 35.8s.
- `pnpm postgres:up && pnpm test:integration:postgres` — 3 files, 52 tests.
  `pnpm e2e:postgres` — 1 passed, the first run of it on this shape. Database
  stopped with `pnpm postgres:down` afterwards.
