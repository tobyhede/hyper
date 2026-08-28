# 03 — Build the Space Card kind in core

**What to build:** Add `space` as a third member of `cardSchema`'s discriminated union, with the Card's own Space View and Graph selections, and reject reference cycles at intake.

**Blocked by:** none. Issue 08 rewrote this ticket against ADR 0068, which is now accepted.

**Status:** ready-for-agent

- [ ] `cardSchema` (`packages/core/src/schema.ts:117`) gains a `spaceCardSchema` member: `kind: 'space'`, `spaceId: uuid`, and the Card's own `spaceView` and `graph` selections. Both selections are **optional in the schema and always written by the UI** (ADR 0068) — manual authoring may omit either, and the Space Card then resolves it from the target Space's active selection. The `spaceId` is immutable: no operation retargets a Space Card, and an author who wants a different target creates another Card.
- [ ] Creating a Space Card takes two shapes and both produce the same Card. It may point at an existing Space, which is one ordinary Edit in the containing Space. Or it may create a new Space alongside it, and creating a Space through the UI mints that Space's initial Markdown Card, an authored Layout containing it, and the Layout's initial empty Active Graph in one Edit (ADR 0068, replacing ADR 0059's no-Layout start). Both use the composition-time `newId` seam `createSpaceAuthoring` already takes.
- [ ] **No multi-Space transaction is needed, and this is the reason.** The create-a-Space-and-its-Card path touches two Spaces, but the reference is not ownership: a Space "remains directly loadable as a root when no Space Card references it" (ADR 0068). So the target Space is committed first and the Space Card second, and a failure between them leaves a reachable orphan Space rather than a broken reference. `commitSpace` stays the seam. Do not add the recursive-Space repository operation the superseded ADR 0058 required.
- [ ] Deleting a Space Card removes the Card and its incident Edges from that Layout, exactly as removing any Card does. **It never deletes the target Space.** Deleting a Space is a separate operation, refused while any Space Card still references it. No cascade and no soft-delete.
- [ ] Deleting a Layout or a Graph that any Space Card selects is refused until those Cards select something else. One deletion never silently changes independently configured Cards in other Spaces.
- [ ] `loadSpace` (`packages/graph`, ADR 0010) accepts the ids of the currently open ancestor Spaces as intake context. It rejects a Space Card whose target is either the Space being loaded or one of those ancestors, alongside the existing reference checks (`unresolved-alias-target`, `alias-self-reference`, `alias-targets-alias` in `packages/graph/src/validate.ts`). Every caller passes that context: an empty chain for a root Space and the accumulated chain when loading a nested one. Navigation performs no second cycle check.
- [ ] References may **converge**. Several Space Cards, in one Space or many, may name the same target, and that is not an error — only a cycle is. Any duplicate-target validation is wrong under this model; do not write one.
- [ ] Import/export (ADR 0030) round-trips the `space` kind, including both selections.

## What changed from the first version of this ticket

It was written against ADR 0058, which ADR 0068 supersedes. Four criteria are gone rather than amended: ownership, atomic target provisioning, cascading deletion, and the recursive-Space repository operation with its duplicate-owner invariant. The reference is a plain reference. What survived is the kind itself, cycle rejection at intake, and import/export — plus the Card's two selection fields, which ADR 0058 had no notion of.

## Cycle-validation boundary

`loadSpace` remains the sole intake. Its ancestor-id input supplies the context a single Space document cannot contain. Direct self-reference is checked against the current Space id; longer cycles are checked against the supplied ancestor chain. Callers loading a child append the current Space id before loading that child. A rejected cycle never becomes a `Space`, and navigation consumes only successfully loaded Spaces.

## Not in scope here

Deleting the multi-Space chooser and re-taking import (issue 04). Entering a Space Card and the Open Spaces surface (issues 09 and 11). Drawing an open Space Card on the canvas (issue 01).
