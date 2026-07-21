# Pass the Space in rather than importing a singleton

Status: resolved

## Context

`packages/app/src/manifest.ts` builds a module-level singleton from the bundled `example/graph.json`, and `store.ts` and `App.tsx` both import it from module scope — so state logic is bound to the one bundled example and can only be tested against it. After issue 01 this file is `app/space.ts` loading `example/space.json` into a `Space`.

## Task

Thread the loaded **Space** through as a value: the store receives it rather than reaching for it.

## Acceptance

- `store.ts` no longer imports the space module at module scope.
- Store behaviour is testable against fixture spaces.
- No behaviour change to the running app; `pnpm e2e` green and unchanged.

## Answer

Built test-first. `pnpm verify` green (77 tests, +5), `pnpm e2e` green and unchanged (14).

`store.ts` now exports `createPresentationStore(space: Space) → { useStore, selectActiveCardId }` and imports nothing from `./space`. The Space is closed over by the store's actions and by `selectActiveCardId`, which used to read the module singleton. `App.tsx` builds the store once at module scope from the bundled `space` singleton (`const { useStore: usePresentationStore, selectActiveCardId } = createPresentationStore(space)`), so every existing call site is unchanged via the destructure-rename.

New `packages/app/test/store.test.ts` exercises the store headlessly through zustand's vanilla API (`getState`/actions) against a fixture Space — first-route selection, step reset on route change, step clamping to the route's length read from the injected space, the enter-presentation guard, and `selectActiveCardId` across overview/presenting. These assertions turn on the passed-in space, which is what proves the injection.

This completes the `space-intake` feature: 01 (intake + rename) and 02 (threading) both resolved.
