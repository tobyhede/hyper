# 11 — One helper mints UUIDs

**What to build:** Replace the repeated `uuidSchema.parse(crypto.randomUUID())` expression with a single named function in `@project/core`, and route every UUID-minting call site through it.

**Status:** resolved

**Why now:** A CodeRabbit review of the batch-import branch flagged the import path's database-side UUID allocator (`SELECT gen_random_uuid() FROM spaces LIMIT 1` in `postgres-space-repository.ts`). Deciding to replace it with `crypto.randomUUID()` makes the import path a fifth copy of an expression already written four times, in two packages, with no shared name.

Existing call sites:

- `packages/app/src/App.tsx:145` — the next Layout id held in a ref
- `packages/app/src/App.tsx:270` — the same id re-minted when the renderer selection changes
- `packages/graph/src/new-space.ts:30` — a new space's id
- `packages/graph/src/new-space.ts:31` — its one card's id

- [ ] The helper lives in `@project/core` beside `uuidSchema`, which owns the `UUID` type and is the one package every consumer already depends on — `graph`, `app`, and the CLI/repository code under `src/` all reach it without widening any dependency.
- [ ] It is named for minting rather than allocating. `newUuid` matches the existing `newSpace` idiom and AGENTS.md's "minted" vocabulary; **allocate** is deliberately avoided, because it was the word that made the import path read as though PostgreSQL had to generate the value.
- [ ] It returns `UUID` and derives that branding by parsing through `uuidSchema` rather than by type assertion — one regex check per minted id is not worth a cast that could drift from the schema.
- [ ] It calls the `crypto` global, not `node:crypto`, so `core` and `graph` stay browser-safe. This is what `new-space.ts` already does.
- [ ] The secure-context requirement (`crypto.randomUUID()` is unavailable over plain HTTP in browsers) is unchanged by this issue but now has exactly one place to grow a fallback if it ever needs one. Record it as a comment on the helper; do not add a fallback speculatively.
- [ ] All four call sites above import the helper, and neither `packages/app` nor `packages/graph` retains a bare `crypto.randomUUID()`.
- [ ] The import path in `src/persistence/postgres-space-repository.ts` uses the helper for missing route, layout and card ids. The space id continues to come from the `spaces.id` column default (`contract.prisma:8`), which needs no helper.
- [ ] `pnpm verify` passes, and `pnpm e2e` passes for the `App.tsx` change.

## Comments

Related but out of scope: ADR 0030:16-17 states "PostgreSQL allocates every missing space, card, route and layout id", which is already inaccurate — layout ids minted by editing an Algorithmic View come from the browser and reach the database through `commitSpace`. Rewording that sentence belongs with the allocator removal, not with this rename.
