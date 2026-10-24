# A Space composition disposes what it composed

Status: ready-for-agent
Tags: Improvement
Held: until after the talk on 30 October 2026; do not start before 31 October 2026 (decided 24 October 2026).
Blocked by: the talk named on the line above, not a ticket.

Surfaced by: the 24 October 2026 architecture review of `main` at `b46ea0c6`, candidate 01, then settled by a grilling loop on 24 October 2026 against `main` at `953dac3`.

## The defect

`composeApp` (`packages/app/src/compose-app.ts`) builds a Space's collaborators in an order it alone states, and its doc comment says a caller cannot get that order wrong because it never writes it. Tearing them down is the opposite: `disposeComposition` (`packages/app/src/open-spaces.ts:843-860`) disposes five of them by name, one after another — `commandOutcomes`, `surface`, `deleteConfirmation`, `authoring`, `presenting`. So Open Spaces knows which collaborators `composeApp` built that hold subscriptions, and a collaborator added to `composeApp` with a subscription of its own is leaked unless the change also finds this function in another module.

The other collaborators `composeApp` answers hold nothing to release: Navigation, `imageReplacement` and `resourceDeletion` subscribe to nothing, and `composeCore` holds no subscription. Checked on `main` at `953dac3` by `grep -n "subscribe(\|observe("` over `navigation.ts`, `image-replacement.ts`, `resource-deletion.ts`, `snapshot.ts` and `map-resolution.ts`: the only hits are Navigation's and `imageReplacement`'s own `subscribe` members, which others call, and none of the five calls another module's. That holds today only; the decision below makes `dispose` the place a later subscriber has to be added.

## Decided

- `ComposedApp` answers one `dispose()`, and `disposeComposition` calls `target.app.dispose()` in place of the five calls. Open Spaces keeps everything that decides *when* a composition may go: the `retired` set, `compositions`, drawing holds, `releaseUnheld`, and republishing `composed` and `replacingImage`.
- It is called `dispose`, the word every collaborator already uses. "Retire" stays Open Spaces' word for an entry leaving, because a composition does not decide when it is safe to go.
- The composition disposes in strict reverse construction order — `presenting`, `commandOutcomes`, `surface`, `deleteConfirmation`, `authoring` — and one comment says so, so a new collaborator's place in teardown follows from its place in construction. Today `presenting` goes last although it is built last. Moving it first means its `dispose` — which disconnects every live fullscreen and Notes-window connection and stops its Navigation subscription — runs while the surface and Authoring are still subscribed. What was checked: `createPresentingWindow` is handed Navigation, `newId`, `now`, the fullscreen adapter, `openNotes`, the presentation link and the reporter, and no Authoring, surface or command outcomes (`compose-app.ts`), so nothing it disconnects publishes into them. Whether the browser's fullscreen exit makes the canvas react while the surface is still live was not checked, so the test records the order rather than relying on that reading.
- The collaborators keep their own `dispose` on the fields `ComposedApp` exposes. There is one caller, and an `Omit` on five fields buys nothing until a second caller reaches for one.
- No ADR and no `CONTEXT.md` entry. ADR 0109 already holds the negative this must keep — no generic lifecycle manager, no adapter seam for a dependency with one in-process implementation — and nothing new is traded off. `ComposedApp.dispose` is not author vocabulary.

## Acceptance

- [ ] `ComposedApp` declares `dispose(): void`, documented as tearing down what `composeApp` built, in reverse construction order, and as the place a collaborator that subscribes to another is torn down.
- [ ] `disposeComposition` in `open-spaces.ts` names no collaborator's `dispose`.
- [ ] `packages/app/test/compose-app.test.ts` exercises teardown through the composition interface, with recording presenting and fullscreen adapters: after `dispose`, an Edit reaches no command outcome, the presenting window connects nothing, and fullscreen has been stopped. The same test records the order: the recording fullscreen adapter's stop is recorded while an observer subscribed to Authoring still receives an Edit made from inside that stop, so `presenting` is shown to go first.
- [ ] The Exit and last-drawing tests in `packages/app/test/open-spaces.test.tsx` (`Exit releases only its listing hold and the last drawing disposes the composition`, `detaches an exited Space’s composition from its retired session`) pass unchanged.
- [ ] The test files that call `composeApp` without disposing are left alone; they are short-lived and out of scope.
- [ ] `pnpm typecheck`, `pnpm typecheck:packages`, `pnpm exec eslint` over the changed files and `pnpm exec vitest run packages/app` clean locally; `CI passed` green on the PR.

Out of scope: a lifecycle manager or registry of disposables; narrowing the collaborators' types on `ComposedApp`; tearing down anything `composeCore` builds.
