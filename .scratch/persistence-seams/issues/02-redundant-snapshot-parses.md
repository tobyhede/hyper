# Four whole-snapshot parses per commit, one of them redundant

Status: ready-for-agent

## Context

A single commit reaching Postgres runs `spaceSnapshotSchema.safeParse` over the
whole snapshot four times, and full reference validation twice:

1. `packages/app/src/space-authoring.ts` — `loadSpaceSnapshot` before submit
2. `packages/persistence/src/http-protocol.ts` — `decodeSnapshot` at the wire
3. `src/persistence/postgres-space-repository.ts` — explicit `safeParse`
4. the same file — `loadSpaceSnapshot`, which itself begins with `safeParse`

Steps 1, 2 and 4 are deliberate: different trust domains, and `AGENTS.md` requires
that every backend commit validate both public shape and domain intake.

Step 3 is not. `loadSpaceSnapshot` takes `unknown` and already parses; the explicit
parse above it exists only to recover `parsed.data`, which the intake result
already carries in reindexed form.

The identical redundancy appears in four files:

- `src/persistence/postgres-space-repository.ts` (`parseSnapshot`)
- `packages/persistence/src/memory.ts` (`commitSpace`)
- `test/support/memory-space-repository.ts` (`commitSpace`)
- `test/support/memory-space-repository.ts` (`importSpaces`)

`packages/app/src/snapshot.ts` (`createWorkingSpaceReader`) exists specifically to
memoize away a fifth parse on the render path that it cannot otherwise avoid.

## Direction

Let the intake return the parsed value; delete the parse directly above it. Keep
every cross-trust-domain validation exactly as it is.

## Caution

Marked ready-for-agent because the change is mechanical, but the two-parse shape
may be load-bearing in a way only the author knows. Confirm before deleting.
