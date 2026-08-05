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

The line drawn, which is the part worth keeping: **the unit of curation is the
module, not the name.** A module reaches the index when something outside
`packages/graph` calls into it, and then every type that module exports is
offered with it — those types are the vocabulary of the calls being made, and
they are nameable the moment a consumer wants a variable for one. Functions are
named one at a time: a helper whose only callers are inside the package stays in
its module, behind the form consumers do call.

That is why **two whole modules** came off the surface rather than names picked
one at a time. `frontmatter` (`OPENING_FENCE`, `FrontmatterSplit`,
`splitFrontmatter`) is how `card-file` reads a fence, and `parseCardFile` is the
intake it exists to serve. `validate` (`Referenceable`,
`SpaceReferenceErrorKind`, `SpaceReferenceError`, `validateReferences`) runs
inside `loadSpace`, which ADR 0010 makes the one intake — a caller never checks
references itself. `isValidGraph` left the surface with them and was then deleted
outright: its only caller was its own test, and once the package no longer
offered it there was nothing holding it up. Six further helpers went:
`cardIdsForRoutes` and `filterHandlesByRoute` behind the plural forms the app
calls, `outHandleId` and `inHandleId` behind `buildCardHandles`/`buildRouteEdges`
which are the only things that build a handle id, and
`incomingEdges`/`routeEntryCards` behind `routeStartCard`.

The rule predicts the whole list, checked name by name. Every one of the
twenty offered values has a caller outside the package and every one of the ten
dropped values has none; no module that kept a value lost a type. The ten names
kept without an importer — `GridStrategyOptions`, `NewSpace`, `SpaceError`,
`LoadSpaceResult`, `LoadSpaceSnapshotResult`, `LayoutPort`, `CardFileError`,
`CardFileErrorKind`, `ParseCardFileResult` and `ParseImportCardFileResult` — are
all types, and each stayed because its module did.

`SpaceReferenceError` fixes the rule's edge, though not by sitting inside a
result union nobody narrows: `loadSpace` returns `SpaceError`, `SpaceError` names
it, and `CardFileError` sits in that same union and is offered. Reachability
separates nothing. Neither does depth — `CardFileErrorKind` is a member of a
member and stayed, `LayoutPort` is three levels inside `LayoutGraph` and stayed,
and `Referenceable` is the direct parameter type of `validateReferences` and
went. What separates them is the module each belongs to, which is the whole rule
restated at its hardest case.

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
