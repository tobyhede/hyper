# One repository seam, declared once, with a shared contract suite

Status: needs-triage

## Context

The same seam is declared twice:

| `packages/http/src/index.ts` | `src/persistence/space-repository.ts` |
|---|---|
| `SpaceResourceRepository` | `SpaceRepository` |
| `SpaceResourceCommitResult` | `RepositoryCommitResult` |
| `LoadedSpace` | `StoredSpace` |
| `SpaceSummary` | `SpaceSummary` |

The two commit-result unions are identical modulo one type name. `SpaceSummary` is
declared identically in `packages/persistence/src/backend.ts` and
`src/persistence/space-repository.ts`. `StoredSpace` and `LoadedSpace` are
field-for-field identical.

`PostgresSpaceRepository` declares `implements SpaceRepository` — never the seam
the HTTP application actually consumes. Conformance is asserted in exactly one
place, `test/unit/space-resource-repository.test.ts`, by a structural
`expectTypeOf`.

There is **no shared contract suite**. `MemorySpaceRepository` is a 211-line
hand-written parallel implementation of production classification policy, and its
own comment says it is maintained by reading the Postgres adapter:

> `PostgresSpaceRepository` draws the same line … so folding them together makes
> this double reject valid input under a code the real backend never returns for it.

## Constraint

ADR 0034 requires `@project/http` to stay browser-safe, so it cannot import
`src/`. That forbids collapsing *toward* the Postgres side. It does not forbid one
declaration in a browser-safe module both sides import, and it does not forbid a
shared contract suite at all.

## Direction, to be grilled

One declaration plus a contract suite both adapters run, as `SpaceBackend` already
has. Whether the declaration lands in `@project/persistence` or a new shared module
is the open question.
