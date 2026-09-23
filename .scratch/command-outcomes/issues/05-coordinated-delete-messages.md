# 05 — Map and Graph delete messages through command outcomes, and `refusedUnder` goes

Status: ready-for-agent
Blocked by: 02, 03, 04

**What to build:** Delete Map (`App.tsx:893-911`) and Delete Graph (:1640-1660) run `coordinatedMapDelete`/`coordinatedGraphDelete` through `run('map-delete' | 'graph-delete', …)`, whose describer is the helpers' `{ kind: 'error', message }`. The navigation after a completed delete stays in the caller, reading `run`'s returned result. Then delete `refusedUnder`. See `../spec.md`.

**Why:** These are the last two loose notice slots, and once they move the render-time reset has nothing left to clear.

## Build

- [ ] `mapDeleteMessage`, `graphDeleteMessage` and `refusedUnder` are deleted from App.
- [ ] `coordinated-context-*.ts` are untouched — replacing them is the review's candidate 2.
- [ ] Every shell notice App draws, except "Link not copied" and the destination-not-found report, reads from the module's state.

## Tests

- [ ] `command-outcomes.test.ts`: both channels, and a Map change clearing them.
- [ ] `graph-delete-notice.test.tsx` keeps its assertions unchanged.

## Done when

- [ ] `rg "refusedUnder|RefusedUnder" packages/app/src` is empty.
- [ ] `pnpm verify` and `pnpm e2e` are green. `pnpm e2e:ladle` is not applicable.

## Comments
