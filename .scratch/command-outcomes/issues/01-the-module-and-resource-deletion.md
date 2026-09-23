# 01 — The command outcomes module, and Resource deletion's notice

Status: resolved

**What to build:** `createCommandOutcomes` in `packages/app/src/command-outcomes.ts`, composed in `composeApp` after `continuation`, with the full channel table declared (entries later tickets fill are declared now and unused until then) and the Map-change reset subscribed to Navigation. Move Resource deletion's refusal onto `resource-delete`, and give Remove from Map its own `resource-remove` channel. See `../spec.md`.

**Why:** Remove from Map publishes through `resourceDeletion.reportRefusal` (`App.tsx:1095`) and is drawn as "Resource not deleted". `resourceDeletion` is also the one module that already owns a refusal channel, so taking it first proves the table against a real consumer.

## Build

- [x] `createCommandOutcomes({ continuation, navigation, reportObserverError })` with `run`, `dismiss`, `dispose`, `getState`, `subscribe`, as the spec's Design describes. `run` returns the operation's result and takes `options.subject` where the channel's describers name one.
- [x] The staleness rule the spec states: per-channel run epoch, the `selectedMapId` at the press for a Map-scoped channel, and the `replacementEpoch`. A settlement failing any of the three publishes nothing, but still reaches `reportBreak` if it threw.
- [x] Composed in `composeApp` and returned with the composition; `createOpenSpaces` passes nothing new (its `reportObserverError` already reaches `composeApp`). `dispose` joins the ordered block at `open-spaces.ts:783-788`, before `continuation.dispose()`, and the comment there says why it is first.
- [x] `resource-deletion.ts` executes through `run('resource-delete', …)`; `refusal`, `reportRefusal` and `dismissRefusal` are deleted from its state and interface. `interactionEpoch` and its `disposed` guard stay — they are about the arm/confirm interaction, not the channel.
- [x] `resource-delete` declares `failureMessage` as its break describer, so a thrown deletion keeps its sentence **and** now reaches `reportBreak` (the spec's one deliberate behaviour change).
- [x] Remove from Map (`App.tsx:1089-1098`) runs through `run('resource-remove', …)`.
- [x] App draws both channels' `ShellNotice`s from the module's state; `resourceDeletion.dismissRefusal()` leaves `refusedUnder`.

## Tests

- [x] New `packages/app/test/command-outcomes.test.ts` covering the spec's list, using `resource-delete` and `resource-remove` as the live channels — including the three staleness races and disposal.
- [x] `resource-deletion` tests that asserted `refusal` assert the channel instead, through the module.
- [x] A regression test per deletion path, Markdown and Space Resource: a thrown deletion publishes `failureMessage`'s sentence on `resource-delete` and reaches the reporter.
- [x] One `Application` test: a refused Remove from Map shows "Resource not removed", not "Resource not deleted".

## Done when

- [x] `rg "reportRefusal|dismissRefusal" packages/app/src` is empty.
- [ ] `pnpm verify` and `pnpm e2e` are green. `pnpm e2e:ladle` is not applicable — no story changes.

## Comments

**2026-09-23, resolved.** `pnpm verify` green (236 files, 3041 tests). `pnpm e2e` was not run by this ticket's agent — the coordinator runs it for the branch — so the verify/e2e box stays open until it does.

- **Commands and channels are two tables.** `run`'s first argument is a *command*, and each command names the channel it reports on. Ordinary and Space Resource deletion answer different refusal unions (`AuthoringRefusal` vs `SpaceResourceRefusal`, whose codes overlap), so they are two commands — `resource-delete` and `space-resource-delete` — on the one `resource-delete` channel, rather than one command whose describer guesses the union. Ticket 04's Enter/Exit/Open are `space-enter`/`space-exit`/`space-open` on `space-command` the same way.
- **The whole table is declared**, commands included: tickets 02–05 wire their call sites and may adjust a describer, and the break sentences chosen for `graph-edit` and `reference-create` (`failureMessage`) are a proposal ticket 02 should confirm against what App does today.
- **Map channels are `reported`.** `map-create`/`map-manage`/`map-delete` take `MapCommandResult` — `{ kind: 'refused', report: CommandNotice } | { kind: 'completed' | 'unchanged' | 'unavailable' }` — and publish the report whole. `run` is generic in the operation's own result, so `MapAuthoringCommands`' richer completed outcomes come back to the caller intact. A Map command has no break sentence here (`broke: null`): a throw reaches the reporter and leaves the channel clear. Tickets 07/08 should decide whether that is right or whether a Map throw needs words.
- **The channel is cleared at the press**, as `resource-deletion`'s `confirm` and App's handlers already did, so `unchanged`/`unavailable` leave it clear without a publish of their own.
- **`authoring` is a fourth dependency** beside `continuation`, `navigation` and `reportObserverError`: the replacement epoch lives on Space Authoring's state, not Navigation's.
- **Behaviour changes beyond the spec's one.** A replacement no longer clears a standing "Resource not deleted" (the old `discard()` cleared the refusal with the interaction); it now behaves like every other notice, which none of the tables says clears on replacement. And the deletion's `interactionEpoch` now guards only the dialog's own state: arming another Resource while a deletion runs no longer suppresses the first one's notice, because the channel's run epoch — bumped by the next *confirm*, not by arming — owns that.
- **`run` is sync-in/sync-out, promise-in/promise-out.** An operation that throws before returning answers `COMMAND_BROKE` synchronously, so asynchronous operations are written with rejections (`resource-deletion`'s Space Resource path is an `async` thunk for that reason).
- `.oxlintrc.json`: `command-outcomes.ts` joins the existing caught-error `no-unknown-parameters` override — its `failure: unknown` parameters are that seam.

