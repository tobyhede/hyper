# Render a Space Card Target read-only through an Alias

Status: resolved
Type: follow-up

## Blocked by

Acceptance and implementation of ADR 0068's Space Card kind, renderer and authoring interactions.

## Decision already made

ADR 0070's capability rule applies when Space Cards exist: an Alias may render the content its Target Space Card owns, but cannot change that Card's Layout, Graph or other content configuration (ADR 0079). The Alias remains ordinarily authorable through its own Title and the containing Layout and Graphs.

## Scope after ADR 0068 is built

- Reuse the production Space Card content renderer under the read-only capability used by Open Aliases.
- Withhold every operation that changes the Target Space Card's configuration.
- Preserve viewer behavior ADR 0068 defines as non-authoring.
- Cover the settled renderer and gestures in unit, application E2E and stable-story evidence.

## Answer

Built (2026-10-13 audit), under current names: an Open Reference Resource whose Target is a Space Resource draws the Target's Map read-only and offers no commands. ADR 0112 makes that one policy of the one Map surface ("the Map is shown through a Reference Resource", `docs/adr/0112-a-map-behaves-the-same-wherever-it-is-drawn.md`), delivered under `.scratch/a-map-is-a-map/`. `packages/app/test/open-spaces.test.tsx` holds the `read-only` policy, `packages/app/e2e/space-resource.spec.ts` the drawn Map offering no commands, and `packages/app/src/kinds/space.ts` withholds the Space rail from a read-only Resource.
