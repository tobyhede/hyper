# Render a Space Card Target read-only through an Alias

Status: needs-info
Type: follow-up

## Blocked by

Acceptance and implementation of ADR 0068's Space Card kind, renderer and authoring interactions.

## Decision already made

ADR 0070's capability rule applies when Space Cards exist: an Alias may render the content its Target Space Card owns, but cannot change that Card's Space View, Graph or other content configuration. The Alias remains ordinarily authorable through its own Title and the containing Layout and Graphs.

## Scope after ADR 0068 is built

- Reuse the production Space Card content renderer under the read-only capability used by Open Aliases.
- Withhold every operation that changes the Target Space Card's configuration.
- Preserve viewer behavior ADR 0068 defines as non-authoring.
- Cover the settled renderer and gestures in unit, application E2E and stable-story evidence.
