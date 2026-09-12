# Aggregate names the Meta-rooted collection, and one Space's is a snapshot

Status: accepted
Related: 0010, 0074, 0077, 0078

"Aggregate" carried at least three distinct meanings in this tree, had no `CONTEXT.md` entry, and one of its spellings was a live name collision resolved only by an import alias. The word now names exactly one thing: **the complete Meta-rooted collection of every Space**. The other two senses lose it.

The question that forced the decision was asked while `.scratch/v1-release/issues/08` was landing — "Aggregate means Meta Space, right?" — which is exactly the inference the word invited and exactly the wrong one. It was a fair reading, because nothing in the glossary said otherwise.

**No: the aggregate contains the Meta Space; it is not the Meta Space.** Meta is one Space, the single root, its id held in the `repository_state` singleton row (ADR 0077, ADR 0078). The aggregate is the whole collection with Meta named as its root — literally `{ metaSpaceId, spaces }`. What makes a set of Spaces an aggregate rather than a pile is the rooting rule: every non-Meta Space must be reached by some Space Thing, or intake reports `ordinary-space-unreferenced` (ADR 0074).

## The three senses that were in the tree

**Sense 1 — the repository-wide collection.** `loadAggregate`, `initializeAggregate`, `replaceAggregate`, `LoadedAggregate`, `AggregateLoadResult`, `AggregateInput`, `SpaceAggregateError`, and ticket 08's `readAggregate`, `exportAggregate`, `importAggregate` and the on-disk aggregate directory. This is the overwhelming majority of uses and every public CLI and persistence name.

**Sense 2 — one Space plus its Things**, the ordinary DDD consistency boundary. `spaceSnapshotSchema`'s doc comment called itself "a complete, fully identified aggregate exchanged at persistence seams", which is one Space. `postgres-space-repository.ts` had a private `loadSpaceAggregate(orm, id): Promise<LoadedSpace | undefined>` and a `preservesAggregateBoundary(current: SpaceSnapshot, next: SpaceSnapshot)` comparing two snapshots of one Space.

**Sense 3 — the repository-state row.** "clear the aggregate root before deleting any Space rows", naming the `RepositoryState` row. In DDD the aggregate root is an entity; here the phrase pointed at the row that *names* that entity. A third shading again.

## The collision was concrete

`src/persistence/postgres-space-repository.ts` held a private `loadSpaceAggregate` returning **one** `LoadedSpace`, and imported `@project/graph`'s `loadSpaceAggregate` — the **collection** one — aliased to `validateSpaceAggregate` purely to avoid the clash:

```ts
import { loadSpaceAggregate as validateSpaceAggregate, loadSpaceSnapshot } from '@project/graph';
```

Two functions, one name, opposite scopes, one file. The alias was load-bearing and read as a stylistic choice rather than as the collision-avoidance it was.

## The decision

**Sense 1 keeps the word.** Sense 2 becomes **Space snapshot**, which the codebase already has a type for; sense 3 becomes **the Meta identity row**.

Concretely: `spaceSnapshotSchema`'s comment speaks of the snapshot, `preservesAggregateBoundary` becomes `preservesSnapshotBoundary`, the private `loadSpaceAggregate` becomes `loadStoredSpace`, and the alias goes — `@project/graph`'s function is imported under its own name, because nothing collides with it any more.

It is the direction the code already leaned, it cost a handful of comments plus one private function rename, and it made the alias unnecessary rather than merely explained. Every ADR 0078 name — `initializeAggregate`, `replaceAggregate` — is untouched, and so is the wire-visible `aggregate-refused` refusal kind, whose rename would be a protocol change with a fixture and test tail rather than a comment sweep.

## What was rejected

**Sense 2 keeps it, and the collection is renamed** — *catalog*, *repository*, *Meta tree*. This is the DDD-faithful reading, and it is the credible alternative. It was rejected on cost and on collision: it renames the entire persistence seam and the CLI surface ADR 0078 deliberately fixed, `CONTEXT.md` already retires catalog-adjacent chrome words, and it fights an accepted ADR's vocabulary to win a purity argument no reader of this repository is having. The cost accepted in exchange is real — a reader who arrives with DDD in mind will read `aggregate` as one consistency boundary and be wrong, which is the mistake that prompted this record. `CONTEXT.md`'s entry and its `_Avoid_` line are what answer that reader, and they are load-bearing for this decision rather than decoration on it.

**Neither sense keeps it**, both getting concrete names. Largest diff, and it would have had to answer what `SpaceAggregateError` becomes, for no gain over the option taken.

## What holds it

`test/unit/current-domain-vocabulary.test.ts` gains the arms, in the idiom every completed rename here has: not a ban on the word, which sense 1 keeps, but on the two phrases that named the retired senses — the boundary phrase in every shape it was written in, and the root phrase, in compound, hyphenated and prose form. The verb phrase "the aggregate rooted at" is untouched and is sense 1 saying what it means.

Being a rename rather than a ban, that guard cannot see a *new* misuse of the word for one Space. This is a known and accepted limit: no regex separates two senses of one spelling. What the guard holds is that the collision is gone and does not come back, and `validateSpaceAggregate` — the alias that existed only to dodge it — is banned outright as the completion criterion for that.
