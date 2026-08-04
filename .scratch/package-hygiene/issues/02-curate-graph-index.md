# `packages/graph/src/index.ts` is uncurated `export *`

Status: needs-triage

## Context

The file is `export *` across twelve modules with no curation, so every internal
helper is public API of the package. Consequences already visible:

- `isValidGraph`, `cardIdsForRoutes`, `filterHandlesByRoute` (singular),
  `incomingEdges`, `routeEntryCards` and `OPENING_FENCE` are exported and used
  only by their own tests or their own file.
- `Placement` had to be introduced as a namespace object rather than as loose
  functions, because bare names like `fromLayout`, `equals` and `next` would
  otherwise land in the package's public surface and collide. The namespace reads
  well and is not a regret — but the reason it was forced is this.

## Direction, to be grilled

Curate the index to what the package actually offers. The open question is whether
that is worth the churn now, or whether it waits until something concrete breaks.

## Caution

Changing what a package exports touches every consumer's import list.
`docs/agents/workflow.md`: keep a rename off a structural commit.
