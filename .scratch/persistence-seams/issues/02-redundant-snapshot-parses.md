# Four whole-snapshot parses per commit, one of them redundant

Status: resolved

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

That first clause is where the work actually is. `LoadSpaceResult` in
`packages/graph/src/space.ts` is
`{ ok: true; space: Space } | { ok: false; errors: SpaceError[] }` — it carries
the indexed `Space` and nothing else — and it is the return type of *three*
functions: `loadSpace`, `loadSpaceSnapshot` and the private `buildSpace` they
share. Only `loadSpaceSnapshot` has a snapshot to hand back, so widening the type
either makes the new field optional across all three or splits the union, and
either way it is a shared seam rather than a local edit. The callers need the
value, not just the `Space`: `packages/persistence/src/memory.ts` (`commitSpace`)
reads `parsed.data.id`, stores `clone(parsed.data)` and answers `not-found` from
it; `src/persistence/postgres-space-repository.ts` (`parseSnapshot`) *returns*
`parsed.data` as its `SpaceSnapshot`; `test/support/memory-space-repository.ts`
does both and iterates `parsed.data.cards`. Reconstructing a snapshot from
`intake.space` instead is a different change with a different risk — the indexed
form is not the stored form.

## Caution

<<<<<<< HEAD
The two-parse shape may be load-bearing in a way only the author knows. Confirm
before deleting. Two specific things to settle first:

- **(a) The seam.** Deleting the outer `safeParse` requires the intake to return
  the parsed snapshot, which means widening `LoadSpaceResult` as described above.
  That is not mechanical, and it is why this is no longer `ready-for-agent`.
- **(b) The message.** The two paths do not fail alike, and the difference is
  client-visible. The outer parse reports `parsed.error.message` — Zod's entire
  serialized issue array in one string — while the intake reports its mapped
  `invalid-shape` messages joined by newline. Deleting the outer parse therefore
  changes what an invalid snapshot tells a client, which is the improvement
  `AGENTS.md` already pins under "A wire codec throws prose, not Zod" (and the
  reason `decodeSnapshot` summarises rather than `.parse`es). Decide whether that
  is an intended part of this change or a separate one, and say so here.

## Resolution

`loadSpaceSnapshot` now returns the schema-parsed snapshot alongside the indexed
Space. The PostgreSQL repository, browser memory backend and server memory
repository consume that accepted value, removing each listed redundant parse
without removing wire, authoring, repository-read or domain-intake validation.

Both questions the Caution raised are answered, and neither was deferred.

**(a) The seam — split, not widened.** `LoadSpaceResult` is untouched, so
`loadSpace` and the shared private `buildSpace` keep the exact type they had. The
snapshot rides on a new `LoadSpaceSnapshotResult`, which is the return type of
`loadSpaceSnapshot` alone — the one function of the three that has a snapshot to
hand back. That avoids both branches the Caution named: no optional field appears
on a result two callers can never populate, and no caller of `loadSpace` sees a
changed type. The value handed back is `parsed.data` itself, not a snapshot
reconstructed from `intake.space`, so the "indexed form is not the stored form"
risk is not taken either. `space-snapshot.test.ts` pins that directly: a snapshot
carrying unknown keys at both levels comes back schema-stripped and equal to the
original, which is what each caller previously got from its own `parsed.data`.

**(b) The message — intended, and the improvement.** Deleting the outer parse
does change what an invalid snapshot tells a client, and that change is part of
this ticket rather than a separate one. `parseSnapshot` previously threw
`parsed.error.message`, Zod's entire serialized issue array in one string; it now
throws the intake's `invalid-shape` messages, each formatted `path: message` and
joined by newline. That is the direction `AGENTS.md` already pins under "A wire
codec throws prose, not Zod" — the same reason `decodeSnapshot` summarises rather
than calling `.parse`. No path gains a Zod dump it did not have; one loses the one
it had.
