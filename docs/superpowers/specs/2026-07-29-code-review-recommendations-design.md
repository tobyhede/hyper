# Code Review Recommendations Design

**Status:** approved

## Goal

Address every actionable recommendation from the CodeRabbit review of
`main...HEAD` without changing the layout-conversion behavior or rewriting
immutable architecture history.

## Scope

The implementation will:

- make the completed-edit persistence waiter reject terminal `failed`,
  `rejected`, and `conflicted` states instead of waiting for a test timeout;
- keep the completed-placement tests inside their intended suite;
- share duplicated editor test fixtures between the editor and completed-edit
  suites;
- extract drag-origin tracking and settled-move detection from the editor store's
  `changeNodes` callback while preserving its state transitions;
- order browser persistence assertions by acknowledged revision and then status;
  and
- mark the completed steps in the existing layout-conversion implementation
  plan.

Two recommendations require no source change. The Prisma migration getter
already declares `override`. ADR 0018 is accepted and immutable; ADR 0025 is the
later refinement and remains the current design authority.

## Design

Shared editor fixtures will live in one test-only module under
`packages/app/test/`. It will export the card-node builder and the moving,
settled, and complete-drag helpers used by both affected suites. Production code
will not depend on this module.

The persistence waiter stays test-only. It will inspect the current state before
subscribing, resolve `settled`, continue waiting for `pending`, and reject every
terminal failure state with an error that names the state. The same terminal
classification will run inside the subscription callback. Tests will cover an
initially terminal state and a transition from pending to terminal so both paths
are regression-protected.

The editor store keeps its public interface and behavior. Two top-level private
helpers will receive the maps and position changes already computed by
`changeNodes`: one records missing drag origins for moving changes; the other
consumes origins for settled changes and returns the ids whose final positions
differ. Existing example and property tests remain the behavioral guard.

The Playwright assertions will first wait for `data-revision` to reach the
expected acknowledged revision, then assert `Persisted`. This makes the status
assertion refer to the commit under test rather than the prior settled state.

## Testing

The terminal-state waiter change follows red-green-refactor: add the regression
tests, run them and confirm the expected timeout-path failure, then implement the
smallest terminal-state classification that passes. Behavior-preserving test
fixture and editor helper extractions use the existing focused suites as their
guard and are checked immediately after each refactor.

Final validation is a fresh CodeRabbit review against `main`, `pnpm verify`,
`pnpm e2e`, and `git diff --check`. The Node version used for verification will
be reported because the repository requires Node 24 or newer.
