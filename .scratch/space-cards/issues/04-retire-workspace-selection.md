# 04 — Retire WorkspaceSelection and relink importSpaces

**What to build:** Delete the multi-Space chooser outright and make CLI import keep every Space it creates reachable.

**Blocked by:** 03 — Build the Space Card kind in core (a linking Space Card can't be minted before the kind exists).

**Status:** ready-for-agent

- [ ] `WorkspaceSelection` (`packages/app/src/WorkspaceSelection.tsx`) is deleted.
- [ ] `createWorkspaceStartup` (`packages/app/src/space.ts`) no longer branches on `listSpaces()` returning more than one Space; the `{kind: 'selection', spaces}` startup state and its handling in `startup.tsx` are removed.
- [ ] `importSpaces` (`src/persistence/space-repository.ts`, ADR 0030) mints a linking Space Card in the root Space for each Space it inserts, in the same transactional import — an imported Space is never stored without becoming reachable.
- [ ] `listSpaces()` may still exist on `SpaceResourceRepository` if something else needs it (e.g. the cascading-delete or export paths from issue 03), but nothing in `packages/app` calls it to decide what to render at startup any more.

## Why this is safe to do outright

Today the only way to get a second Space into the store is `importSpaces` — there is no in-app "create a new Space" action, so `WorkspaceSelection` is reachable in practice only through that one CLI path. Relinking import (this ticket) removes the only case that made the chooser necessary before Space Cards existed.

## Not in scope here

Building the `space` kind itself (issue 03, must land first). Any navigation UI for moving into a Space Card once one exists (issue 05).
