# 01 — Decide what "aggregate" names, and retire the other sense

Status: ready-for-human
Tags: vocabulary

**What to decide:** "Aggregate" carries at least three distinct meanings in this
tree, has no `CONTEXT.md` entry, and one of its spellings is a live name
collision resolved only by an import alias. A human has to pick which sense
keeps the word before an agent can rename anything.

**Why now:** the question was asked of `.scratch/v1-release/issues/08` while it
was landing — "Aggregate means Meta Space, right?" — which is exactly the
inference the word invites and exactly the wrong one. It is a fair reading
because nothing in the glossary says otherwise, and ticket 08 has just added
more of the word (`hyper.json`, "aggregate directory", `readAggregate`,
`exportAggregate`, `importAggregate`, `describeAggregateRefusal`).

## The answer to the question that prompted this

No: **the aggregate contains the Meta Space; it is not the Meta Space.**

- **Meta Space** is one Space — the single root. Its id is `metaSpaceId`, held
  in the `repository_state` singleton row.
- **The aggregate** is the whole collection: every Space, with Meta named as its
  root. Literally `{ metaSpaceId, spaces }`
  (`packages/persistence/src/backend.ts:17`), described in `@project/graph` as
  "A complete, validated Meta-rooted collection of Spaces"
  (`packages/graph/src/space-aggregate.ts:12`).

What makes a set of Spaces an aggregate rather than a pile is the rooting rule:
`ordinary-space-unreferenced` requires every non-Meta Space to be reached by
some Space Thing (`packages/graph/src/space-aggregate.ts:213-223`, reporting at `:221`).

## The three senses actually in the tree

**Sense 1 — the repository-wide collection.** `loadAggregate` (112),
`initializeAggregate` (65), `replaceAggregate` (35), `LoadedAggregate` (25),
`AggregateLoadResult` (21), `AggregateInput` (20), `SpaceAggregateError` (32),
and ticket 08's `readAggregate` / `exportAggregate` / `importAggregate` and the
`hyper.json` "aggregate directory".

**Sense 2 — one Space plus its Things**, the ordinary DDD consistency boundary.

- `packages/core/src/schema.ts:371` — `spaceSnapshotSchema` is documented "A
  complete, fully identified **aggregate** exchanged at persistence seams". That
  is one Space.
- `src/persistence/postgres-space-repository.ts:147` —
  `loadSpaceAggregate(orm, id): Promise<LoadedSpace | undefined>`. One Space.
- `src/persistence/postgres-space-repository.ts:312` —
  `preservesAggregateBoundary(current: SpaceSnapshot, next: SpaceSnapshot)`
  compares two snapshots of **one** Space; the "boundary" it means is that
  Space's own diagram/thing structure, not the collection's.

**Sense 3 — the repository-state row.**
`src/persistence/postgres-space-repository.ts:431-432`: "clear the **aggregate
root** before deleting any Space rows", naming the `RepositoryState` row. In DDD
the aggregate root is an entity; here the phrase points at the row that *names*
that entity. A third shading again.

## The collision is concrete, not theoretical

`src/persistence/postgres-space-repository.ts` contains a private
`loadSpaceAggregate(orm, id)` returning **one** `LoadedSpace` (`:147`), and at
`:8` imports `@project/graph`'s `loadSpaceAggregate` — the **collection** one —
aliased to `validateSpaceAggregate` purely to avoid the clash:

```ts
import { loadSpaceAggregate as validateSpaceAggregate, loadSpaceSnapshot } from '@project/graph';
```

Two functions, one name, opposite scopes, one file. The alias is load-bearing
and reads as a stylistic choice rather than as the collision-avoidance it is.
`loadSpaceAggregate` appears 41 times across 12 files and means different things
in different ones.

## `CONTEXT.md` never defines it

The glossary uses the word three times (`:22`, `:144`, `:148` — the last two
added by ticket 08) and defines it nowhere. For a term with **1300 occurrences
across 61 distinct identifier spellings**, that is the gap this issue exists to
close. Whatever is decided, `CONTEXT.md` gains an entry with an `_Avoid_` line.

## Options

Each keeps the word for one sense and retires it from the others.

- **A — sense 1 keeps it** (recommended). "Aggregate" means the Meta-rooted
  collection, which is already the overwhelming majority of uses and every
  public CLI and persistence name. Sense 2 becomes **Space snapshot**, which the
  codebase already has a type for (`SpaceSnapshot`) — so `schema.ts:371`'s
  comment and `preservesAggregateBoundary` are renamed to speak of the snapshot,
  and postgres's private `loadSpaceAggregate` becomes `loadStoredSpace` or
  similar. Sense 3 becomes "the Meta identity row". Smallest diff, and it leaves
  every ADR 0078 name (`initializeAggregate`, `replaceAggregate`) untouched.
- **B — sense 2 keeps it**, and the collection is renamed — *catalog*,
  *repository*, *Meta tree*. This is the DDD-faithful reading, but it renames
  the entire persistence seam and the CLI surface ADR 0078 fixed, and
  `CONTEXT.md` retires "catalog"-adjacent chrome words already. Expensive and
  fights an accepted ADR's vocabulary.
- **C — neither keeps it**; both senses get concrete names. Largest diff, and it
  would have to answer what `SpaceAggregateError` becomes.

**Recommendation: A.** It is the direction the code already leans, it costs a
handful of comments plus one private function rename, and it makes the alias at
`postgres-space-repository.ts:8` unnecessary rather than merely explained.

## Constraints on doing it

- **The rename runs alone, and not inside a feature commit.**
  `docs/agents/workflow.md` — "Never let a rename ride along with a structural
  change. Separate commits — otherwise the diff is unreadable and, when
  something breaks, you cannot tell which change did it." This is why ticket 08
  landed the word rather than fixing it.
- **A repo-wide rename runs early**, because every ticket completed before it
  adds new surface in the old vocabulary — ticket 08 just did.
- **Write it as a tracked codemod, not a `sed` one-liner**, following
  `.scratch/thing-and-diagram/rename-layout-to-diagram.mjs` and its sibling, and
  read the header first: both record the mask-then-rewrite-then-unmask design,
  the spellings not to change, and the files not to open at all.
- **Merge with `-M20%`**, or git stops reporting heavily-rewritten files as
  renames.
- **It is not finished until `test/unit/current-domain-vocabulary.test.ts` can
  prove it.** Add the retired sense in **kebab-case** arms as well as
  PascalCase/camelCase — a hyphen is not a word character, so `\b` arms read
  straight past `aggregate-refused` and `aggregate-root`, which is the shape a
  rename mostly carries.
- **Check the affordability first, the way ADR 0085 did.** That ADR rejected
  *Object* because the scan would have needed 287 exceptions, "which is no
  guard". Before committing to an option, count the exceptions its guard would
  need — ADRs and historical `.scratch/` trees legitimately name retired words,
  and `aggregate-refused` is a wire-visible `AuthoringRefusal` kind whose rename
  is a protocol change, not a comment sweep.

## Out of scope

Whether `hyper.json`'s on-disk key `metaSpaceId` or the directory format changes
at all. The format is ticket 08's and is already the clearer of the two names;
this issue is about the word in code and prose.

## Comments

### Raised while landing v1-release/08, 11 September 2026

The `aggregate-refused` refusal kind is worth pricing separately under any
option. It crosses the HTTP boundary (`packages/persistence/src/http-protocol.ts`)
and is rendered by `packages/app/src/authoring-refusal.ts`, so renaming it is a
wire change with a fixture and test tail, not prose. Option A leaves it alone,
which is part of why A is cheap.
