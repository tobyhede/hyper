# 10 — Discarded settlements follow nothing

Status: resolved
Blocked by: 09

**What to build:** `run` answers `COMMAND_DISCARDED` (`{ kind: 'discarded' }`) in place of the whole result when a settlement is stale, so no caller can act on discarded work. Split the Map rule in the channel table: `resetsOnMapChange` keeps notice lifetime, and a new `completionMovesMap` (on `map-create` and `map-delete`) lets a `completed` outcome pass the Map check while every other outcome is still held to it. New Map continues through `continueAt` on both the Command Dock and the embedded rail. See `../spec.md` (Design: staleness, and the channel table's last column).

**Why:** `run` hands back a stale `completed` (`command-outcomes.ts:546-555`), so the Dock's and the rail's New Map `.then` (`App.tsx:1485-1492`, `space-resource-context-commands.ts:87-98`) and the top-level Graph delete's `activateGraph` move the caret or Navigation after a Map change or replacement. Meanwhile the one flag `resetsOnMapChange` is two rules at once, and read as a staleness rule it would discard every top-level New Map and Delete Map's own completion, because that completion is what moved the selection. `CONTEXT.md` (Replacement epoch) already names the behaviour: work made under a moved epoch is discarded by its owner, produces no Edit, and is not a refusal.

Grilled out of the 2026-09-23 architecture review of this branch (candidate 1).

## Build

- [x] `COMMAND_DISCARDED` beside `COMMAND_BROKE`; `run`'s return type is `Result | CommandBroke | CommandDiscarded` (and the Promise form). A discarded settlement replaces the whole result — never `completed`, `unchanged` or `refused`. A stale settlement that threw still reaches `reportBreak` (the defect happened whether or not anyone is left to be told) but answers `COMMAND_DISCARDED`, not `COMMAND_BROKE`: staleness decides what the caller hears, the reporter hears the defect.
- [x] `CHANNELS` gains `completionMovesMap`: `true` for `map-create` and `map-delete`, `false` elsewhere. The Map check applies to every outcome except a `completed` one on such a channel. `resetsOnMapChange` keeps only its notice-lifetime meaning, and its doc comment stops calling itself "two rules at once".
- [x] `map-create` takes `continueAt`, typed to return `PendingContinuation` (not `| null`), so a current `completed` means the continuation was requested. The Dock and the rail pass their own target (the rail's is scoped to its Space Resource) and stop requesting it in `.then`.
- [x] The top-level Graph delete keeps `activateGraph` in the caller, guarded by `completed`, which now excludes discarded work.
- [x] Every caller that answers its surface locally handles `discarded` explicitly, through an exhaustive switch, as "nothing to say": `renameDraftAnswer` → `null`; Exit → no `exitReport`; Create Reference → `'done'`; the rail's New Map → `false`.

## Tests

- [x] `command-outcomes.test.ts`, with the real `createNavigation`: each of the three staleness races (run epoch, Map, replacement) answers `discarded`; a completed `map-create` still requests its continuation after its own selection move; a refused `map-create` settling after the author changed Map is discarded and publishes nothing; a replacement mid-run requests no continuation; a discarded settlement that threw still reaches the reporter.
- [x] Dock and rail tests stop asserting caret routing and keep only their treatment.

## Out of scope

- A replacement of the embedded **target** Space mid-run is Map authoring's staleness (`current()` in `map-authoring-commands.ts`), checked only before the Edit. Noted, not built.
- The code-review follow-ups on this branch (resource deletion's `interactionEpoch` gate, the `refusedUnder` comment, tickets 06–07's "live availability" boxes).
- The rail's Graph follow-ups — they wait for a Graph authoring commands module.

## Done when

- [x] `rg "\.then\(\(outcome\)" packages/app/src` finds no caller requesting a continuation after `map-create`.
- [ ] `pnpm verify` and `pnpm e2e` are green. `pnpm e2e:ladle` only if a story changes. — `pnpm verify` green (237 files, 3121 tests); `pnpm e2e` not run locally, CI runs it; no story or `@project/ui` component changed, so `e2e:ladle` does not apply.

## Comments

- **Built.** `run` answers `COMMAND_DISCARDED` for any settlement that fails the run-epoch, Map or replacement check, and for one that settles after `dispose()`. A stale throw reaches `reportBreak` and answers `COMMAND_DISCARDED`; a current throw still answers `COMMAND_BROKE`. The Map check exempts a `completed` outcome only where the channel's `completionMovesMap` is set (`map-create`, `map-delete`).
- **How staleness reads "completed".** `space-enter`'s result is an `OpenSpace`, which carries no `kind`, so staleness cannot read a result's kind generically without a runtime shape check. A `CommandDefinition` instead declares an optional `completed` predicate; the two Map-channel definitions declare it, and `current` consults it only where `CHANNELS[channel].completionMovesMap` is set.
- **`map-create`'s result type** is now `MapEditOutcome<CreatedMap>` (was `MapCommandResult`), so `continueAt` receives the minted `mapId`. Its options are required: `MapCreateContinuation`, answering `PendingContinuation`.
- **Dead continuation plumbing removed.** Once the rail stopped requesting its own continuation, `continuation` had no reader on `SpaceResourceRailContext`, the decoration context, `useCanvasResourceAuthoring`, `EmbeddedMapAuthoring` or `SpaceCanvas`, so it was deleted along that chain (and from the tests that passed it). The rail's continuation now goes through the containing canvas's command outcomes, whose continuation is the same containing composition's the rail used before.
- **Dock and rail tests.** No Dock or rail unit test asserted the continuation request itself; the rail's `persists a new map` test still asserts the `true` answer, and `SpaceApp.test.tsx`'s "puts the caret in its name" stays, as the Dock's end-to-end treatment. Routing is now proved in `command-outcomes.test.ts` (`a command whose completion moves the Map`).
