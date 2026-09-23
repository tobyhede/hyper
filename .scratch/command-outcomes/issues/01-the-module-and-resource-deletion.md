# 01 — The command outcomes module, and Resource deletion's notice

Status: ready-for-agent

**What to build:** `createCommandOutcomes` in `packages/app/src/command-outcomes.ts`, composed in `composeApp` after `continuation`, with the full channel table declared (entries later tickets fill are declared now and unused until then) and the Map-change reset subscribed to Navigation. Move Resource deletion's refusal onto `resource-delete`, and give Remove from Map its own `resource-remove` channel. See `../spec.md`.

**Why:** Remove from Map publishes through `resourceDeletion.reportRefusal` (`App.tsx:1095`) and is drawn as "Resource not deleted". `resourceDeletion` is also the one module that already owns a refusal channel, so taking it first proves the table against a real consumer.

## Build

- [ ] `createCommandOutcomes({ continuation, navigation, reportObserverError })` with `run`, `dismiss`, `dispose`, `getState`, `subscribe`, as the spec's Design describes. `run` returns the operation's result and takes `options.subject` where the channel's describers name one.
- [ ] The staleness rule the spec states: per-channel run epoch, the `selectedMapId` at the press for a Map-scoped channel, and the `replacementEpoch`. A settlement failing any of the three publishes nothing, but still reaches `reportBreak` if it threw.
- [ ] Composed in `composeApp` and returned with the composition; `createOpenSpaces` passes nothing new (its `reportObserverError` already reaches `composeApp`). `dispose` joins the ordered block at `open-spaces.ts:783-788`, before `continuation.dispose()`, and the comment there says why it is first.
- [ ] `resource-deletion.ts` executes through `run('resource-delete', …)`; `refusal`, `reportRefusal` and `dismissRefusal` are deleted from its state and interface. `interactionEpoch` and its `disposed` guard stay — they are about the arm/confirm interaction, not the channel.
- [ ] `resource-delete` declares `failureMessage` as its break describer, so a thrown deletion keeps its sentence **and** now reaches `reportBreak` (the spec's one deliberate behaviour change).
- [ ] Remove from Map (`App.tsx:1089-1098`) runs through `run('resource-remove', …)`.
- [ ] App draws both channels' `ShellNotice`s from the module's state; `resourceDeletion.dismissRefusal()` leaves `refusedUnder`.

## Tests

- [ ] New `packages/app/test/command-outcomes.test.ts` covering the spec's list, using `resource-delete` and `resource-remove` as the live channels — including the three staleness races and disposal.
- [ ] `resource-deletion` tests that asserted `refusal` assert the channel instead, through the module.
- [ ] A regression test per deletion path, Markdown and Space Resource: a thrown deletion publishes `failureMessage`'s sentence on `resource-delete` and reaches the reporter.
- [ ] One `Application` test: a refused Remove from Map shows "Resource not removed", not "Resource not deleted".

## Done when

- [ ] `rg "reportRefusal|dismissRefusal" packages/app/src` is empty.
- [ ] `pnpm verify` and `pnpm e2e` are green. `pnpm e2e:ladle` is not applicable — no story changes.

## Comments
