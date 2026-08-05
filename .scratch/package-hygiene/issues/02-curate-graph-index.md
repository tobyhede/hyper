# `packages/graph/src/index.ts` is uncurated `export *`

Status: needs-triage

## Context

The file is `export *` across twelve modules with no curation, so every internal
helper is public API of the package. That surface is 55 distinct names, and **24
of them have no importer anywhere outside `packages/graph`**. Consequences
already visible:

- `isValidGraph`, `cardIdsForRoutes`, `filterHandlesByRoute` (singular),
  `incomingEdges`, `routeEntryCards` and `OPENING_FENCE` are exported and used
  only by their own tests or their own file. `OPENING_FENCE` is the strictest
  case — not even a test reads it. Note that the *plural*
  `filterHandlesByRoutes` does have a real consumer (`App.tsx`), and the
  singular's retention is documented intent (AGENTS.md, ADR 0023), not drift.
- The other eighteen: `GridStrategyOptions`, `NewSpace`, `SpaceError`,
  `LoadSpaceResult`, `LoadSpaceSnapshotResult`, `LayoutPort`, `FrontmatterSplit`,
  `splitFrontmatter`, `CardFileErrorKind`, `CardFileError`, `ParseCardFileResult`,
  `ParseImportCardFileResult`, `outHandleId`, `inHandleId`, `Referenceable`,
  `ReferenceErrorKind`, `ReferenceError`, `validateReferences`. Some are
  legitimately part of the surface though never imported by name —
  `GridStrategyOptions` is `gridStrategy`'s parameter type, `SpaceError` and
  `LoadSpaceResult` are `loadSpace`'s return shape, consumed structurally. So
  curation is a judgement per name, not a mechanical delete of all 24.
- One real collision exists today: `validate.ts` exports an **interface named
  `ReferenceError`**, which shadows the JavaScript global in any file importing
  it — `validate.test.ts` does exactly that.
- `Placement` had to be introduced as a namespace object rather than as loose
  functions, because bare names like `fromLayout`, `equals` and `next` would
  otherwise land in the package's public surface and collide. The namespace reads
  well and is not a regret — but the reason it was forced is this. To be exact,
  that collision is prospective: none of its eight member names collides with
  anything the index exports today, though consumer-side shadowing is real
  (`space-authoring.ts` imports `Placement` and has two local `const next`).

## Direction, to be grilled

Curate the index to what the package actually offers. The open question was
whether that is worth the churn now — and the churn turns out to be small, which
materially changes the answer. Because all 24 candidates are externally
unimported, curating the index to the 31 names actually used changes **zero
import sites outside `packages/graph`**: the 40 consumer files across `app`,
`react-flow-adapter`, `persistence`, root `src/` and root `test/` are untouched.
The whole change is the index file plus four of `graph`'s own tests
(`traversal.test.ts`, `routes.test.ts`, `validate.test.ts`,
`graph.property.test.ts`) repointing at their own modules rather than reaching
internal names through `../src/index`.

## Caution

The original caution here — "changing what a package exports touches every
consumer's import list" — does not hold for this change, for the reason above.
It would hold for a rename. `docs/agents/workflow.md` still applies if one rides
along: keep a rename off a structural commit.
