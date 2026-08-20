# 01 — Structure Space Authoring refusals

**What to build:** Replace prose-only Space Authoring refusals with the closed,
typed refusal identity decided by ADR 0057, and map those identities to wording,
field placement and recovery in application composition.

**Status:** done

- [x] Inventory every current `refuse(...)`, eligibility refusal and caller.
- [x] Define one exhaustive `AuthoringRefusal` union whose variants carry stable
  codes and only their required domain context.
- [x] Make Authoring and eligibility return structured refusals; remove
  programmatic comparisons and domain tests against display prose.
- [x] Map refusals exhaustively at application surfaces. Card title and Alias
  Target validation attach to their fields; invariant failures remain failures.
- [x] Remove the manufactured generic Card Editor error story. Persistence
  failures remain represented only by workspace persistence states.
- [x] Update property, unit, Ladle and application browser coverage.
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass.

## Comments

An audit of the New Alias follow-up found that the global placement result can
make a pane accept an impossible refusal while rendering it away from the field
the placement names. Issue
[03 — Route Authoring refusals once per surface](03-route-refusals-per-surface.md)
tracks the pane-specific presentation adapter; this issue remains done because
its structured identity and application-owned placement decision shipped.
