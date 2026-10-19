# 01 — A browser-safe aggregate reader

Status: ready-for-agent

**What to build:** the pure core of the Aggregate-directory reader, and a browser-safe workspace package to hold what a mounted page must reach (ADR 0130, spec "Implementation Decisions").

- The core reads a complete aggregate, images included, from a `ReadonlyMap<string, Uint8Array>` of relative paths. It has no `node:` import: it decodes text with `TextDecoder` and joins paths as strings. `readAggregateFiles` (`src/aggregate-directory/aggregate-file.ts`), which Export already uses for its read-back check, is the starting point. Image reading (`images.ts`) joins it.
- The filesystem shell under root `src/` walks the disk, builds that map from exactly the paths Importing scans, and feeds the core. `pnpm hyper import`, `run` and Export's read-back all go through it, and their refusals and their wording do not change.
- A new browser-safe package holds the reader core, the aggregate lifecycle (`src/persistence/aggregate-lifecycle.ts`, with `isDeepStrictEqual` replaced), the memory `SpaceRepository` (`src/persistence/memory-space-repository.ts`) and the product resolution `src/http/space-host.ts` performs. It is registered the way every package is: an alias in `tsconfig.base.json` and `vitest.config.ts`, a narrowed `paths` in its own tsconfig, and a lint zone. `app` may import it.

**Depends on:** nothing.

**Acceptance:**

- The existing aggregate-directory tests run against the core with an in-memory map as well as through the disk shell, so the two cannot diverge.
- A structural test fails any `node:` import in the new package. `test/unit/codemirror-encapsulation.test.ts` is the prior art for an import guard.
- `pnpm hyper run` on the fixture behaves as before, and `test/integration/run-command.test.ts` and `hyper-cli.test.ts` pass unchanged.
