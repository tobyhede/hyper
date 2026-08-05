# One repository seam, declared once, with a shared contract suite

Status: resolved

## Context

The same seam is declared twice. Names correspond like this — but read the
right-hand column of *declaration sites* carefully, because the duplication is
one-directional and the first framing of this issue got it wrong:

| Name the HTTP side uses | Name the server side uses | Declared where |
|---|---|---|
| `SpaceResourceRepository` | `SpaceRepository` | `packages/http/src/index.ts:39` / `src/persistence/space-repository.ts:43` |
| `SpaceResourceCommitResult` | `RepositoryCommitResult` | `packages/http/src/index.ts:30` / `src/persistence/space-repository.ts:14` |
| `LoadedSpace` | `StoredSpace` | `packages/persistence/src/backend.ts:8` / `src/persistence/space-repository.ts:8` |
| `SpaceSummary` | `SpaceSummary` | `packages/persistence/src/backend.ts:3` / `src/persistence/space-repository.ts:3` |

`packages/http` does not declare `LoadedSpace` or `SpaceSummary` at all — it
*imports* both from `@project/persistence` (`index.ts:2-8`). So the real
duplication is `src/persistence/space-repository.ts` re-declaring two types
`@project/persistence` already owns, not two peers drifting apart.

The two commit-result unions are identical modulo one type name — the `conflict`
variant carries `LoadedSpace` on one side and `StoredSpace` on the other, and
since those are field-for-field identical (`snapshot`, `revision`,
`exportedRevision`, same order, same types) the unions are mutually assignable.
`SpaceSummary` is declared identically in both places, and there is no third
declaration. (`database-persistence/13` removed a `conflict` variant from
`RepositoryImportResult`, a third type; both commit-result unions were left
untouched.)

The two repository interfaces are **not** the same shape, which the original
table obscured. `SpaceRepository` has five members; `SpaceResourceRepository` has
three — `importSpaces` and `markExported` are server/CLI-only. "One declaration"
therefore means `SpaceRepository extends SpaceResourceRepository`, not a merge.

`PostgresSpaceRepository` declares `implements SpaceRepository` — never the seam
the HTTP application actually consumes. Conformance is asserted in exactly one
place, `test/unit/space-resource-repository.test.ts`, by a structural
`expectTypeOf` — which `pnpm test` does not enforce, since `expectTypeOf` is a
runtime no-op without `test.typecheck`; only the root `pnpm typecheck` catches
it, the same trap AGENTS.md records for `space-http-app-types.test.ts`. That
test is largely documentation in any case: both composition call sites
(`src/http/postgres-http-runtime.ts` and `test/support/e2e-http-runtime.ts`) are
in the root typecheck program, so a break in either adapter fails typecheck with
or without it.

There is **no shared contract suite**. `MemorySpaceRepository` is a 190-line
hand-written parallel implementation of production classification policy, and its
own comment says it is maintained by reading the Postgres adapter:

> `PostgresSpaceRepository` draws the same line … so folding them together makes
> this double reject valid input under a code the real backend never returns for it.

(It was 211 lines when this was filed. `persistence-seams/02` — "Remove
redundant snapshot parses" — cut 45 of them, so this issue has already been
partly overtaken by its own sibling.)

The `SpaceBackend` precedent the Direction cites is real and load-bearing:
`packages/persistence/test/backend-contract.ts` exports
`spaceBackendContract(name, createHarness)`, is published as a package subpath,
and is run by two implementations — `MemorySpaceBackend` and `HttpSpaceBackend`
over the real Hono app.

## Constraint

ADR 0034 requires `@project/http` to stay browser-safe, so it cannot import
`src/`. That forbids collapsing *toward* the Postgres side — though note the
reason is enforcement rather than runtime: `src/persistence/space-repository.ts`
is a pure type module and would be harmless in a bundle, so the browser-safety
argument alone would not settle it. What settles it is that
`packages/http/tsconfig.json` narrows `paths` past `src/` and `eslint.config.js`
blocks the relative escape — two independent layers, both green today.

It does not forbid one declaration in a browser-safe module both sides import:
`src/` already imports `@project/http`, `@project/core` and `@project/graph` by
name, and ESLint restricts `src/` only from reaching *into* `packages/*/src/**`
by relative path. And it does not forbid a shared contract suite at all —
`@project/persistence/test-support` is the existing, working precedent for
exactly that publication pattern.

## Direction, to be grilled

One declaration plus a contract suite both adapters run, as `SpaceBackend` already
has. Whether the declaration lands in `@project/persistence` or a new shared module
is the open question.

## Answer

Done. The declaration landed in `@project/persistence`, in a new
`src/repository.ts` beside `backend.ts`: `SpaceResourceRepository` and
`RepositoryCommitResult`, written in terms of the `LoadedSpace` and
`SpaceSummary` that package already owned. `@project/http` imports both instead
of declaring them, and `src/persistence/space-repository.ts` is now

```ts
export interface SpaceRepository extends SpaceResourceRepository {
  importSpaces(input: readonly ImportSpace[], mode: ImportMode): Promise<RepositoryImportResult>;
  markExported(id: UUID, revision: bigint): Promise<void>;
}
```

No new module. A third home would have been a third place to look for a seam
this issue exists because there were two of.

**Names.** `StoredSpace` went and `LoadedSpace` stayed. The two were
field-for-field identical, so this was purely which word to keep, and the wire
codec settled it: `encodeLoadedSpace`, `decodeLoadedSpace` and `LoadedSpaceJson`
in `http-protocol.ts` already spoke of a *loaded* space in the package that was
keeping the declaration. Keeping `StoredSpace` would have meant renaming those
three across two browser-safe packages to say the same thing. Likewise
`SpaceResourceCommitResult` went and `RepositoryCommitResult` stayed:
`SpaceResource` is HTTP-resource vocabulary that stops meaning anything once the
type lives in `@project/persistence`, and `Repository` is the word both
interfaces already use. `loadStoredSpace` in the PostgreSQL adapter became
`loadSpaceAggregate`, which is what its own comments call the thing.

`SpaceResourceRepository` is *not* re-exported from `@project/http`. Its
neighbours `LoadedSpace` and `SpaceSummary` were never re-exported either, and
consumers already reach for those from `@project/persistence`.

**The contract suite** is `test/support/repository-contract.ts`, exporting
`spaceRepositoryContract(name, createHarness)`, run by
`test/unit/memory-space-repository.test.ts` over `MemorySpaceRepository` and by
`test/integration/postgres-space-repository.test.ts` over
`PostgresSpaceRepository`. Fifteen cases: import/list/load/commit, stale
conflict, the three commit rejections, card removal, exported-revision
carry-through and its missing-Space refusal, the four import rejections,
truncate mode freeing the Card ids it clears, and identity minting.

It is **not** published behind `@project/persistence/test-support`, unlike the
`SpaceBackend` contract it is modelled on, and that is forced rather than
chosen: it is written against `SpaceRepository`, whose extra two members are CLI
capability and stay out of the browser-safe package, and `packages/persistence`
may not import `src/` — its tsconfig `paths` resolve only `core` and `graph`,
and ESLint blocks the relative escape. Both consumers are root tests, so there
is no boundary to publish across and no `package.json`, `tsconfig.base.json` or
`vitest.config.ts` change was needed.

Three behaviours were left out because the two implementations do not genuinely
share them, and the deliberate difference the double's own comment warns about
was preserved rather than smoothed over:

- **`listSpaces` ordering.** Both sort ascending by id — one through
  `String.localeCompare`, the other through PostgreSQL's ordering of the `uuid`
  type. Those agree for canonical lowercase UUIDs by a property of ICU
  collation, not by anything either implementation promises. The contract
  compares catalogs as sets, as the `SpaceBackend` contract already does.
- **Rejection messages**, except the two both produce character-for-character
  (`Duplicate card identity "<id>"` and `Space <id> already exists`), which the
  contract does pin. `Duplicate Space identity <id>` versus
  `Duplicate space identity "<id>"` for a repeated *space* id is a genuine
  divergence; the contract asserts the code only, and it is a real finding —
  the two disagree on prose while agreeing on classification.
- **Transactional isolation.** The concurrent-insert race and the one-statement
  aggregate read are PostgreSQL behaviour a `Map` cannot have; they stay in the
  integration suite.

The batch/stored distinction the double's comment defends — a Card repeated
inside one batch is `duplicate-identity`, a Card a stored Space owns is
`card-ownership` — is asserted as two separate contract cases, so folding them
together now fails against both implementations rather than silently only
against one.

**Unverified:** the PostgreSQL half was not run. `pnpm test:integration:postgres`
needs a live database and none was available; the suite is correct by
construction, walked case by case against `PostgresSpaceRepository`, and
typechecks in the root program.

`test/unit/space-resource-repository.test.ts` kept its `expectTypeOf` conformance
check and gained the superset assertion. The issue is right that `pnpm test`
does not enforce either — only `pnpm typecheck` does.
