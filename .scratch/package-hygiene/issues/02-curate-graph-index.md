# `packages/graph/src/index.ts` is uncurated `export *`

Status: resolved

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

## Resolution

Fourteen names left the index and forty-one stayed. No import site outside
`packages/graph` moved, as predicted.

The line drawn, which is the part worth keeping: the index names every function
and value a consumer calls, plus the types those signatures make a consumer write
down — a parameter, a return shape, or a member of one narrowed by name. A helper
whose only caller is the module declaring it stays there, and so does a type
reachable only from inside a result union nobody narrows.

That rule took **two whole modules** off the surface rather than picking names one
at a time. `frontmatter` (`OPENING_FENCE`, `FrontmatterSplit`, `splitFrontmatter`)
is how `card-file` reads a fence, and `parseCardFile` is the intake it exists to
serve. `validate` (`Referenceable`, `SpaceReferenceErrorKind`,
`SpaceReferenceError`, `validateReferences`, `isValidGraph`) runs inside
`loadSpace`, which ADR 0010 makes the one intake — a caller never checks
references itself. Six further helpers went: `cardIdsForRoutes` and
`filterHandlesByRoute` behind the plural forms the app calls, `outHandleId` and
`inHandleId` behind `buildCardHandles`/`buildRouteEdges` which are the only things
that build a handle id, and `incomingEdges`/`routeEntryCards` behind
`routeStartCard`.

The judgement calls went the other way for `GridStrategyOptions`, `NewSpace`,
`SpaceError`, `LoadSpaceResult`, `LoadSpaceSnapshotResult`, `LayoutPort`,
`CardFileError`, `CardFileErrorKind`, `ParseCardFileResult` and
`ParseImportCardFileResult`. None is imported by name today; each is the parameter
or result shape of an exported function, consumed structurally now and nameable
the moment a consumer wants a variable for one. `SpaceReferenceError` is the
counter-example that fixes the rule's edge: it is reachable from `loadSpace` only
through `SpaceError`, a union nothing narrows.

The guard is `test/unit/graph-package-surface.test.ts`, written red first. It
holds three things together: the index declares no `export *`, its declarations
name exactly the offered list, and the module those declarations produce carries
exactly the offered *values* at runtime. Parsing catches the type-only exports
that `Object.keys` cannot see; the runtime read catches a type re-exported as a
value or a name resolving to nothing. It sits in the root suite beside
`point-type-identity.test.ts`, which already reads `packages/graph/src` with the
TypeScript compiler — inside `graph` it would mean the package declaring a
`typescript` dependency it does not otherwise have.

The `ReferenceError` collision was fixed both ways, in a separate commit as the
caution above requires. It left the public surface with the rest of `validate`,
and it was renamed to `SpaceReferenceError`, because curation only shrinks the
blast radius to the three files inside the package — `validate.ts`, `space.ts` and
`validate.test.ts` — and `validate.test.ts` importing the bare name is the case
this ticket recorded. `Referenceable` kept its name; it collides with nothing.

The `Placement` namespace stayed one object. Its eight member names are exactly
what this curation exists to keep out of the surface.
