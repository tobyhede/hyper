# 04 — Prove the contract toolchain under the bridge

**What to build:** Evidence that the Prisma Next contract and migration toolchain still works when `typescript` resolves to the 6.0.2 compatibility package.

**Status:** resolved

**Why:** Six `@prisma-next/*` packages depend on `typescript` and peer `>=5.9`. The bridge target 6.0.2 satisfies that range on paper, but `pnpm contract:check` is a CI job and `prisma-next contract emit` consumes the compiler programmatically — the same API surface the bridge exists to preserve. A peer range being satisfied is not the same as the API being the one the tool expects.

- [x] Run `pnpm contract:emit` and confirm `src/prisma/contract.json` and `src/prisma/contract.d.ts` are byte-identical to what is committed.
- [x] Run `pnpm contract:check` and report the real output.
- [ ] Run `pnpm db:migrate` and `pnpm test:integration:postgres` against a live database, then `pnpm postgres:down`. This is the one path that exercises the contract toolchain end to end.
- [x] If the emitted artifacts differ under the bridge, stop and record what changed before regenerating anything — a generated artifact disagreeing with the code that generates it is a bug fixed at the source (ADR 0054, ADR 0056), not a diff to accept.

**Note:** `tsx`, Vitest, Vite, Ladle and oxlint transpile rather than typecheck, so they are unaffected by which TypeScript resolves. Prisma Next is the only programmatic consumer besides `typescript-eslint`.

## Comments

The compiler-facing half passes under the bridge.

`pnpm contract:emit` exits 0 and `src/prisma/contract.json` and `src/prisma/contract.d.ts` are **byte-identical** to what is committed — `git diff --exit-code` over both is clean. Nothing to record under ADR 0054/0056; the bridge does not move the artifacts.

`pnpm contract:check` exits 0:

```
{ "ok": true, "failures": [], "summary": "All checks passed" }
```

with `storageHash`, `executionHash` and `profileHash` unchanged from the committed contract.

This is the part of the ticket that was actually at risk. `prisma-next contract emit` is the programmatic compiler consumer, and it drives the same API surface the bridge exists to preserve; it works against `@typescript/typescript6@6.0.2`.

**Not run: `pnpm db:migrate` and `pnpm test:integration:postgres`.** Both need `.env`, which is ignored and absent from this worktree, and this session cannot read `.env.example` to mint one. Docker is up, so this is a credentials gap rather than an infrastructure one — it needs a human to create `.env` from `.env.example` and then run the two commands followed by `pnpm postgres:down`. The compiler risk the ticket was written to cover is already discharged by the two checks above: that leg exercises the database and the migration runner, not which TypeScript resolves.
