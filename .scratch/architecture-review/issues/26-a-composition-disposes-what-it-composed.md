# A Space composition disposes what it composed

Status: done
Tags: Improvement
Blocked by: None — can start immediately. Built after the 30 October 2026 talk, by decision.

Surfaced by: the 24 October 2026 architecture review of `main` at `b46ea0c6`, candidate 01, then settled by a grilling loop on 24 October 2026 against `main` at `953dac3`.

## The defect

`composeApp` (`packages/app/src/compose-app.ts`) builds a Space's collaborators in an order it alone states, and its doc comment says a caller cannot get that order wrong because it never writes it. Tearing them down is the opposite: `disposeComposition` (`packages/app/src/open-spaces.ts:843-860`) disposes five of them by name, one after another — `commandOutcomes`, `surface`, `deleteConfirmation`, `authoring`, `presenting`. So Open Spaces knows which collaborators `composeApp` built that hold subscriptions, and a collaborator added to `composeApp` with a subscription of its own is leaked unless the change also finds this function in another module.

The other collaborators `composeApp` answers hold nothing to release: Navigation, `imageReplacement` and `resourceDeletion` subscribe to nothing, and `composeCore` holds no subscription.

## Decided

- `ComposedApp` answers one `dispose()`, and `disposeComposition` calls `target.app.dispose()` in place of the five calls. Open Spaces keeps everything that decides *when* a composition may go: the `retired` set, `compositions`, drawing holds, `releaseUnheld`, and republishing `composed` and `replacingImage`.
- It is called `dispose`, the word every collaborator already uses. "Retire" stays Open Spaces' word for an entry leaving, because a composition does not decide when it is safe to go.
- The composition disposes in strict reverse construction order — `presenting`, `commandOutcomes`, `surface`, `deleteConfirmation`, `authoring` — and one comment says so, so a new collaborator's place in teardown follows from its place in construction. Today `presenting` goes last although it is built last; it reads only Navigation, so moving it first changes nothing observable.
- The collaborators keep their own `dispose` on the fields `ComposedApp` exposes. There is one caller, and an `Omit` on five fields buys nothing until a second caller reaches for one.
- No ADR and no `CONTEXT.md` entry. ADR 0109 already holds the negative this must keep — no generic lifecycle manager, no adapter seam for a dependency with one in-process implementation — and nothing new is traded off. `ComposedApp.dispose` is not author vocabulary.

## Acceptance

- [x] `ComposedApp` declares `dispose(): void`, documented as tearing down what `composeApp` built, in reverse construction order.
- [x] `disposeComposition` in `open-spaces.ts` names no collaborator's `dispose`.
- [x] `packages/app/test/compose-app.test.ts` exercises teardown through the composition interface, with recording presenting and fullscreen adapters: after `dispose`, an Edit reaches no command outcome, the presenting window connects nothing, and fullscreen has been stopped.
- [x] The Exit and last-drawing tests in `packages/app/test/open-spaces.test.tsx` (`Exit releases only its listing hold and the last drawing disposes the composition`, `detaches an exited Space’s composition from its retired session`) pass unchanged.
- [x] The test files that call `composeApp` without disposing are left alone; they are short-lived and out of scope.
- [x] `pnpm typecheck`, `pnpm typecheck:packages`, `pnpm exec eslint` over the changed files and `pnpm exec vitest run packages/app` clean locally; `CI passed` green on the PR.

Out of scope: a lifecycle manager or registry of disposables; narrowing the collaborators' types on `ComposedApp`; tearing down anything `composeCore` builds.
