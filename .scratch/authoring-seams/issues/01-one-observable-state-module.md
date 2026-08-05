# One observable-state module; three publishers disagree

Status: resolved

## Context

Three modules implement the same publish-to-listeners behaviour at three
hardening levels. Verified at `62023a4`:

| publisher | copies listener set | contains a throw | handles async rejection |
|---|---|---|---|
| `packages/app/src/navigation.ts` (`setState`) | no | no | no |
| `packages/persistence/src/session.ts` (`publish`) | no | yes | yes |
| `packages/app/src/space-authoring.ts` (`publish`) | yes | yes | yes |

`space-authoring.ts` carries a comment explaining why copying matters — a `Set`
visits entries added mid-iteration, so a listener subscribing during publication
is notified about a state it was not watching, a number of times that depends on
where it was added. `session.ts` does not copy. Nothing pins its behaviour either
way; `space-authoring.test.ts` pins only Authoring's.

`isThenable` is defined twice, with near-identical explanatory comments:
`packages/persistence/src/session.ts:43` and
`packages/app/src/space-authoring.ts:168`. `safelyReport` likewise.

Navigation's bare publisher was the reachable throw inside the install window
that `62023a4` made total. That fix removed the consequence; the divergence
itself is still here.

## Direction

One observable-state module holding `getState`/`subscribe`/`publish`, with the
copy, the containment, the thenable interception and the error reporting in one
place. Each collaborator keeps its own interface and its own state — only
notification moves behind the seam.

## Constraint that must survive

Observable-state notification remains non-throwing: it contains synchronous
observer failures and asynchronous rejections, continues to later observers and
reports diagnostics through an injected non-throwing sink. This seam should not
absorb unrelated error policies such as HTTP logging unless they become actual
consumers of the same observable-state contract.

## Verification

`pnpm verify` exits 0: 75 test files, 751 tests passed. `pnpm e2e` exits 0: 68
passed — the same 68, and the same names, as before the seam moved. That is what
behaviour-preserving was supposed to mean, and it held.

The 751 is one above what the extraction itself left. The added test is the other
half of the non-throwing sink: a reporter that throws from the *synchronous* path
is caught by the `try` that called the observer, so an unwrapped sink still looks
contained there, and every other test in the file stays green against a copy that
wraps only that path. The thenable path has no such `try` — a rejection handler
that throws rejects a promise nobody holds, which Node answers by killing the
process.

## Answer

`@project/persistence` now owns `createObservableState`, the one module behind
Navigation, SpaceSession and SpaceAuthoring's existing `getState`/`subscribe`
interfaces. Publication installs the new state synchronously, snapshots the
subscriber set, contains synchronous throws and asynchronous rejections,
continues to later observers, and reports through a contained injected sink.

SpaceAuthoring's queued-completion diagnostics remain outside that seam and use
the shared non-throwing reporter mechanism directly. The observable-state tests
pin the complete notification contract, and Navigation has a wiring regression
test for the previously reachable throw.

## The home, decided

`@project/persistence` owns the module, and `packages/app/src/navigation.ts`
imports it from there although Navigation has nothing to do with persistence.
That is the decision, not an accident to be tidied later.

`core` is not a better home. It is the domain model — the Zod schemas and the
`Card`/`Route`/`RouteEdge`/`Layout` types derived from them — and a generic
pub/sub is no more at home among those than beside a commit queue. Moving it
there buys a name that reads better in one import statement and loses the
package's meaning.

A dedicated `@project/observable` is the shape that actually matches the
dependency graph: the module depends on nothing, and both real consumers would
then depend on it rather than one of them depending on the other's package. It
was judged not worth a package for ~65 lines — a manifest, a tsconfig with its
own narrowed `paths`, an entry in every alias list `AGENTS.md` names as two to
keep in sync, and a lint zone, all to carry one file with no dependencies. Revisit
it when a third consumer arrives from a package that cannot legally see
`persistence`.

The import as it stands is legal and acyclic under both enforced layers: `app` is
the composition layer and its narrowed `paths` already resolve `@project/persistence`,
which it depends on for `SpaceSession` regardless, and `persistence` neither
imports nor may import `app`.
