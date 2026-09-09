# Move the registry coordination tests beside the registry

Status: resolved
Tags: release/v1, Improvement
Blocked by: none
Related: `architecture-review/14` — this is the deferred tail of its
"Replace helper-level composition tests" acceptance.

Surfaced by: `architecture-review/14`, which replaced the `open-space.ts`
helper tests with behavioural tests through the Open Spaces interface and left
one file behind.

## The problem

`packages/app/test/space-card-lifecycle.test.ts` composes
`createSpaceSessionRegistry` directly and drives `registry.spaceCards(...)`
against a `MemorySpaceBackend`. Nothing it asserts is about Open Spaces
composition: it is a test of the registry's coordination — the barrier, the
participant set, the aggregate refusals and the cascade — which
`packages/persistence` owns.

It reads as an `app` test only because the helper it grew beside lived there.
While it stays, `app` looks like it still composes registries itself, which is
exactly the ownership rule `architecture-review/14` closed.

## What to build

Move the file to `packages/persistence/test/`, beside
`session-registry.test.ts`, keeping its cases intact. What survives in `app`
is whatever genuinely crosses the Open Spaces interface; if that is nothing,
nothing survives — `packages/app/test/open-spaces.test.ts` already covers
`spaceCards` through `createOpenSpaces`.

Two things make this more than a `git mv`, which is why it was deferred rather
than folded into `architecture-review/14`:

- the file imports `composeApp` from `packages/app/src/compose-app`, and
  `persistence` may not depend on `app`. Each case that composes an app needs
  either to drop that composition or to stay behind as an Open Spaces test.
- coverage thresholds are per-package and pinned at what already holds, so
  moving tests across a package boundary moves the coverage with them
  (AGENTS.md, "Verify").

## Acceptance

- [x] No test outside `packages/persistence` composes a `SpaceSessionRegistry`
      *to assert coordination* — see the Answer for why the criterion as
      written is not the one that held.
- [x] The moved cases assert the same coordination behaviour they do now.
- [x] `pnpm verify` is green, including the per-package coverage thresholds on
      both `app` and `persistence`.

## Answer

Resolved by `4966a47b` (“test: move the registry coordination tests beside the
registry”), which landed the day after this ticket was written and closed it
without the ticket being triaged or updated. This entry is the retrospective
close.

`packages/persistence/test/space-card-lifecycle.test.ts` now holds the
coordination cases — the barrier, the participant set, the aggregate refusals,
the conflict and retry arms and the create/link/delete cascade — beside
`session-registry.test.ts`, and it composes the registry directly because it
owns it.

The first acceptance line did not survive contact, and deliberately so. What
stays in `packages/app/test/space-card-lifecycle.test.ts` is the two *reads*
`app` adds over the registry's three writes, and `packages/app/test/opened-space.ts`
is the shared helper that opens a Space the way the application does. Both call
`createSpaceSessionRegistry`, because `createSpaceCardLifecycle` is written over
a registry rather than a session (ADR 0076): a lifecycle built beside a session
the registry has never seen coordinates nothing, so an `app` test of an
`app`-owned module cannot avoid constructing one. Neither file asserts
coordination; both say so in their own doc comments. The rule that actually
holds is the ownership one — coordination behaviour is proved in `persistence`
— not the literal absence of a constructor call.
