# 03 — Build the Space Card kind in core

**What to build:** Add `space` as a third member of `cardSchema`'s discriminated union, and the persistence operations ADR 0058 requires to create and delete one atomically.

**Blocked by:** none (ADR 0058 settled the domain value).

**Status:** ready-for-agent

- [ ] `cardSchema` (`packages/core/src/schema.ts:117`) gains a `spaceCardSchema` member: `kind: 'space'`, `spaceId: uuid`, no other fields — mirrors `aliasCardSchema`'s single `target` field.
- [ ] Creating a Space Card is one atomic Edit: it mints the Card id and a new empty target Space (ADR 0018's one-card template) together, through the same composition-time `newId` seam `createSpaceAuthoring` already uses for Card/Layout ids. No code path can produce a Space Card whose target doesn't exist.
- [ ] `SpaceResourceRepository` (`packages/persistence/src/repository.ts`) gains the operations this needs — today it only has `listSpaces()`/`loadSpace(id)`/`commitSpace(id, ...)`; there is no create-Space or delete-Space operation at all.
- [ ] Deleting a Space Card cascades: the Space it owns, and everything nested inside it (arbitrarily deep — a Space reached only through Space Cards owned transitively by the deleted one), is deleted in the same Edit. No soft-delete.
- [ ] `loadSpace` (`packages/graph`, ADR 0010) rejects a Space Card whose target is an ancestor of the Space being loaded, alongside the existing reference checks (`unresolved-alias-target`, `alias-self-reference`, `alias-targets-alias` in `packages/graph/src/validate.ts`).
- [ ] Import/export (ADR 0030) round-trips the `space` kind.

## Open implementation question: what "ancestor" means to `loadSpace`

`loadSpace` validates one Space document in isolation — a direct self-reference (a Space Card whose `spaceId` equals the Space it's authored in) is checkable from that document alone, the same way Alias's self-reference check works. A longer cycle (A's Space Card points at B, B's points back at A) is not: knowing B was reached *via* A requires the chain of currently-open ancestor ids, which isn't part of B's own document. Either `loadSpace`'s signature grows to accept that chain (bigger change, but keeps the check at the one intake point ADR 0058 names), or only direct self-reference is rejected at intake and the general cycle case is refused at navigation time instead (the app already knows its own open chain, doesn't need a schema change, but moves the check out of `loadSpace`). ADR 0058 says "the same intake point every other reference check already runs through" without settling which of these it meant — resolve this before implementing the cycle check, not while implementing it.

## Not in scope here

Deleting `WorkspaceSelection` and relinking `importSpaces` (issue 04). Any navigation UI (issue 05). Rendering a Space Card on the canvas (issue 01) — that ticket is blocked on this one.
