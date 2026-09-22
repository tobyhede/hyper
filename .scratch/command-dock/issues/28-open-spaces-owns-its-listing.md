# 28 — Open Spaces owns its listing and the select operation

Status: resolved
Tags: release/v1
Blocked by: None.

Audited: 2026-09-20 against `b1ac983d`. PR 240 is merged (`ba3982c6`); the listing and selection work below is still unbuilt. This ticket is required before the release candidate's final proof (`v1-release/07`).

**What to build:** Open Spaces answers the Open Spaces menu's rows itself, and gives the menu one `select` operation, so the rule `CONTEXT.md` states once — "The Meta Space is always listed first, whether or not it is open: choosing it when it is not opens it directly, with no Opener" — is implemented in one module rather than five.

## Why

PR 240 spent five commits on that one rule (22b13003, 46c3776b, 52f2f1c0, 89a64b78, f1f951cb) and each fix landed in a different module:

- `App.tsx` maps `openSpacesState.entries` into rows by reaching into `entry.session.getState().working.document.title` and `.persistence`, then hands them to `openTree`.
- `openTree` (`dock-model.ts`) takes `metaSpaceId` as a parameter. Its first version sorted Meta only among the roots, so Meta Entered from Platform drew indented under it — a bug in how the helper was called, which its own tests could not see.
- `App.tsx` rebuilds the Opener's `{ spaceId, title }` separately, and reads Meta from `spaces.meta()`.
- `CommandDock.tsx` re-derives `closedMeta` by checking Meta is absent from the open rows, and draws that row separately.
- `App.tsx`'s `onSwitchTo` chooses between `open` and `switchTo` on `entry === undefined` — so any row with no entry is opened, not only a closed Meta, bypassing `switchTo`'s mid-exit handling — and rebuilds the failure title fallback.

Open Spaces already republishes on every session change (`open-spaces.ts`, the `session.subscribe` in `compose`), so a listing derived inside it stays live without new wiring.

## Decisions

1. **Derived, not stored.** `OpenSpaces` gains `listing()`, computed from `getState()` and memoized on state identity. `OpenSpacesState` stays the raw facts (entries, `openedFrom`, `activeSpaceId`).
2. **One list, closed Meta included.** Each row is `{ spaceId, title, depth, open: true, persistence }` or `{ spaceId, title, depth: 0, open: false }`; the second arm is only ever a closed Meta. Meta is first, open or not; the tree below follows the Opener as `openTree` does today. The Dock's `closedMeta` goes.
3. **The trigger's count reads the list.** "N open" and `unwellElsewhere` count only `open: true` rows, so the closed Meta row cannot be counted by construction.
4. **`opener(spaceId)`** on `OpenSpaces` answers `{ spaceId, title } | null`. App calls it with the rendered Space's id and stops searching entries for the Opener's title.
5. **`select(spaceId)`** on `OpenSpaces`, named for `CONTEXT.md`'s "Selecting an entry switches to that Space". It switches to an open Space, opens a closed Meta with no Opener, and refuses anything else. It returns an outcome — `{ kind: 'switched' } | { kind: 'opened' } | { kind: 'refused', code: 'space-not-open' }`. `switched` and `opened` carry the Space's title; `refused` carries none, because the only way to reach it is a non-Meta Space that closed after the listing was drawn, and `OpenSpaces` no longer holds that Space's title. Load failures still throw. Selecting the Space already on the canvas answers `switched`.
6. **`meta()` is removed** from the interface; its rule (live session title while open, startup title otherwise) becomes how the listing titles Meta's row. `metaSpaceId` stays, because the Exit rule still reads it.
7. **`open` and `switchTo` stay public.** Startup, stories (`CommandDockFixture`, the embedded-diagram stories) and tests set the set up through them; `select` is built on them.
8. **`openTree` folds into `open-spaces.ts` as a private helper.** `dock-open-tree.test.ts` is rewritten as `open-spaces.test.ts` cases over the memory backend, through `listing()`.
9. **Dock props.** `meta` and `openSpaces` become one `listing` prop; `opener` stays, filled from `spaces.opener(...)`; `onSwitchTo` becomes `onSelect`. The Dock stays a pure view.
10. **A refusal reads like a failure.** `space-not-open` only happens in a race (the Space closed between render and click); the Dock says "<Title> could not be opened." for it as for a thrown failure, with the title from the row it drew and the user chose — the Dock already holds it, so `select` neither takes a title nor keeps a last-known one.
11. **Tests.** The Meta-row rule cases in `space-set-freshness.test.tsx` (closed Meta titled when the Space list read fails, Meta first when Entered from Platform, the failure title) move to `open-spaces.test.ts`. One rendered case stays to show the Dock draws the listing. The `command-dock-always-reaches-meta` Ladle and e2e proofs are unchanged.

## Out of scope

- The Exit rule App restates (`exitDisabled` against `meta-space-permanent`) and the exit title fallback — candidate 3 of the architecture review, the Space-command lifecycle.
- The `spaces === null` mode under `SpaceApp`: App passes an empty listing and a `null` Opener, as now.
- No ADR: this moves where an existing rule is computed; ADR 0082 leaves that open.

## Acceptance

- [x] `OpenSpaces` exposes `listing()`, `opener(spaceId)` and `select(spaceId)`; `meta()` is gone.
- [x] `openTree` and `closedMeta` are gone; App builds no rows and reads no session title for the Dock.
- [x] `select` refuses a closed non-Meta Space with `space-not-open`, proven red first in `open-spaces.test.ts`.
- [x] The listing's rule cases live in `open-spaces.test.ts`; `dock-open-tree.test.ts` is deleted.
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` green.
