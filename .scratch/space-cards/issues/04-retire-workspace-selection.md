# 04 — Retire the multi-Space chooser

**What to build:** Delete the multi-Space startup chooser outright. ADR 0069's durable addresses replace it.

**Blocked by:** none. The blocking edge was the linking Space Card, and that criterion is withdrawn.

**Status:** ready-for-agent

- [ ] `WorkspaceSelection` (`packages/app/src/WorkspaceSelection.tsx`) is deleted.
- [ ] `createWorkspaceStartup` (`packages/app/src/space.ts`) no longer branches on `listSpaces()` returning more than one Space; the `{kind: 'selection', spaces}` startup state and its handling in `startup.tsx` are removed.
- [ ] `importSpaces` (`src/persistence/space-repository.ts`, ADR 0030) is left alone. **This criterion is withdrawn**, re-taken by issue 08 against ADR 0068: it rested on ADR 0058 making a Space Card the only path to a Space, and 0068 says a Space "remains directly loadable as a root when no Space Card references it". An imported Space with no Space Card is reachable at its own address under ADR 0069, so there is no orphan to close and no reason for import to author a Card in someone else's Space.
- [ ] `listSpaces()` may still exist on `SpaceResourceRepository` if something else needs it (export, or the refusal that guards deleting a Space still referenced by a Space Card), but nothing in `packages/app` calls it to decide what to render at startup any more.

## Why this is safe to do outright

The chooser answers "which of several Spaces do you want?" at startup. ADR 0069 answers it instead, and better: every Space has a durable address, `/` redirects to the one `entrySpaceId`, and any Space may still be loaded independently as the root of its own navigation context. A startup screen that picks between Spaces is a worse version of a URL.

That argument stands on its own and does not need the import half, which is why the import half is withdrawn above rather than kept as a smaller version of itself.

## Not in scope here

Building the `space` kind itself (issue 03). Entering a Space Card and the Open Spaces surface (issue 11).
