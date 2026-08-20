# 03 — Build the Space Card kind in core

**What to build:** Add `space` as a third member of `cardSchema`'s discriminated union, and the persistence operations ADR 0058 requires to create and delete one atomically.

**Blocked by:** none (ADR 0058 settled the domain value).

**Status:** ready-for-agent

- [ ] `cardSchema` (`packages/core/src/schema.ts:117`) gains a `spaceCardSchema` member: `kind: 'space'`, `spaceId: uuid`, no other fields — mirrors `aliasCardSchema`'s single `target` field.
- [ ] Creating a Space Card is one atomic Edit: it mints the Card id and a target Space containing ADR 0018's initial Markdown Card, with no Layout or authored placement, through the same composition-time `newId` seam `createSpaceAuthoring` already uses for Card/Layout ids. No code path can produce a Space Card whose target doesn't exist.
- [ ] `SpaceResourceRepository` (`packages/persistence/src/repository.ts`) gains one recursive-Space Edit operation. Its input carries the complete next snapshots and expected revisions for every affected existing Space, plus the complete snapshots to create and ids to delete. The repository validates the whole change before side effects and commits it in one transaction. Creating a Space Card and cascading its deletion both use this seam; separate create/delete calls or a sequence of per-Space `commitSpace` calls are not permitted. `commitSpace` remains the seam for an ordinary Edit confined to one existing Space.
- [ ] Recursive-Space aggregate intake rejects any `spaceId` named by more than one Space Card, considering both stored state and the complete proposed transaction. Import uses the same invariant. Duplicate-owner validation must exist before cascading deletion is enabled.
- [ ] Deleting a Space Card derives the complete descendant closure before calling that operation. The parent update and deletion of the Space it owns and every transitively owned descendant are committed in the same transaction. No soft-delete.
- [ ] `loadSpace` (`packages/graph`, ADR 0010) accepts the ids of the currently open ancestor Spaces as intake context. It rejects a Space Card whose target is either the Space being loaded or one of those ancestors, alongside the existing reference checks (`unresolved-alias-target`, `alias-self-reference`, `alias-targets-alias` in `packages/graph/src/validate.ts`). Every caller passes that context: an empty chain for a root Space and the accumulated chain when loading a nested Space. Navigation performs no second cycle check.
- [ ] Import/export (ADR 0030) round-trips the `space` kind.

## Cycle-validation boundary

`loadSpace` remains the sole intake. Its ancestor-id input supplies the context a single Space document cannot contain. Direct self-reference is checked against the current Space id; longer cycles are checked against the supplied ancestor chain. Callers loading a child append the current Space id before loading that child. A rejected cycle never becomes a `Space`, and navigation consumes only successfully loaded Spaces.

## Not in scope here

Deleting `WorkspaceSelection` and relinking `importSpaces` (issue 04). Any navigation UI (issue 05). Rendering a Space Card on the canvas (issue 01) — that ticket is blocked on this one.
