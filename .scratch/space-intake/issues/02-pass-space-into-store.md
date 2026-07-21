# Pass the Space in rather than importing a singleton

Status: open
Blocked by: 01

## Context

`packages/app/src/manifest.ts` builds a module-level singleton from the bundled `example/graph.json`, and `store.ts` and `App.tsx` both import it from module scope — so state logic is bound to the one bundled example and can only be tested against it. After issue 01 this file is `app/space.ts` loading `example/space.json` into a `Space`.

## Task

Thread the loaded **Space** through as a value: the store receives it rather than reaching for it.

## Acceptance

- `store.ts` no longer imports the space module at module scope.
- Store behaviour is testable against fixture spaces.
- No behaviour change to the running app; `pnpm e2e` green and unchanged.
