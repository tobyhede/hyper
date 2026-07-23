# Fail e2e on any React Flow console warning

Status: resolved

## Context

React Flow ships sixteen numbered dev-mode warnings, and six of them describe states this adapter can reach: #002 (a fresh `nodeTypes`/`edgeTypes` object every render), #004 (unsized parent container), #008 (an edge naming a handle id that doesn't resolve), #010 (`<Handle>` outside a custom node), #013 (stylesheet not loaded), #015 (dragging without `onNodesChange`). Since 12.11.0 each message carries a doc link, so a failure is self-navigating.

Nothing reads them. `packages/app/e2e/presentation.spec.ts` attaches no console listener, and `playwright.config.ts` has no global setup that would. The app can render an edge attached to nothing while every assertion passes.

This is the cheapest coverage in the plan: one fixture, and every scenario e2e already drives — and every scenario added later — is gated for free.

## Task

Add an auto-use Playwright fixture that captures console output and fails the test if React Flow complained.

- New `packages/app/e2e/fixtures.ts` extending `@playwright/test` with an auto-use fixture that subscribes to `page.on('console')` and `page.on('pageerror')`, collects matching messages, and asserts the collection is empty after the test body returns.
- Existing specs import `test`/`expect` from `./fixtures` instead of `@playwright/test`.
- **Scope the match narrowly to start**: messages whose text contains `[React Flow]`, at `warning` or `error` level, plus any uncaught page error. Do *not* fail on arbitrary console noise — Vite HMR and React devtools chatter would make the gate flaky, and a gate people disable is worse than no gate.
- The failure message should include the captured text verbatim, since React Flow's own message names the rule and links the doc.

Note the warnings are development-only. Playwright drives the dev server (`webServer` in `playwright.config.ts`), so they are present; this gate would be inert against a production build.

## Acceptance

- `pnpm e2e` passes on the current tree, or reports a real React Flow warning that we then fix — either outcome is a result, and the second is the more interesting one.
- Deliberately breaking a rule fails the suite. Cheapest check: move the `nodeTypes` constant inside `GraphView`'s body and confirm #002 fails a test; revert.
- No spec has to opt in — importing `test` from `./fixtures` is the only per-file change.

## Notes

Whether #008 fires on the current tree answers the open `useUpdateNodeInternals` question recorded in `AGENTS.md`. Record the observation here either way.

## Answer

Shipped as `packages/app/e2e/fixtures.ts` — an auto-use fixture wrapping
Playwright's `test`, collecting `console` warnings/errors whose text contains
`[React Flow]` or `reactflow.dev/error#`, plus any `pageerror`, and asserting
the collection is empty after each test body. `presentation.spec.ts` now imports
`test`/`expect`/`Locator`/`Page` from `./fixtures`; nothing else changed.

Confirmed against the library rather than assumed: warnings are emitted by
`createDevWarn` in `@xyflow/system` as
``console.warn(`[${lib}]: ${message} Help: ${helpUrl}error#${id}`)``, with
`createDevWarn('React Flow', 'https://reactflow.dev/')` in `@xyflow/react`, and
guarded by `process.env.NODE_ENV === 'development'`. Hence the two-way match and
the dev-only caveat in the fixture's doc comment.

Acceptance:

- 16/16 e2e pass on the current tree with the gate live, so **no React Flow
  warning fires today**.
- The gate demonstrably fails: temporarily giving `<ReactFlow>` a `nodeTypes`
  whose `card` value is a new closure per render made
  `selecting a route keeps the others on screen` fail with React Flow's own #002
  text and doc link. Reverted.

### Correction to this ticket's own suggestion

The proposed break — "move the `nodeTypes` constant inside `GraphView`'s body" —
**does not trip #002**, and a first attempt at it passed. `useNodeOrEdgeTypesWarning`
compares per-key *values* against a ref, not object identity, so a fresh object
holding the same `CardNode` reference is silent. Only a new *component identity*
per render trips it. Worth knowing before trusting a green run of that mutation.

### On the open `useUpdateNodeInternals` question

**#008 does not fire on the current tree.** So the stale-handle-internals exposure
recorded in `AGENTS.md` is real but not currently manifesting — consistent with
the reasoning that `RoutedEdge` masks it by drawing ELK's own points. This is
evidence about today's fixture and today's code paths only: it says nothing about
what happens once routes can be added or removed on a live graph, which is when
handle *count* changes. Re-check when graph editing lands; this gate will now say
so on its own.
