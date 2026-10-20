# 01 — A browser-safe aggregate reader

Status: resolved

**What to build:** the pure core of the Aggregate-directory reader, and a browser-safe workspace package to hold what a mounted page must reach (ADR 0130, spec "Implementation Decisions").

- The core reads a complete aggregate, images included, from a `ReadonlyMap<string, Uint8Array>` of relative paths. It has no `node:` import: it decodes text with `TextDecoder` and joins paths as strings. `readAggregateFiles` (`src/aggregate-directory/aggregate-file.ts`), which Export already uses for its read-back check, is the starting point. Image reading (`images.ts`) joins it.
- The filesystem shell under root `src/` walks the disk, builds that map from exactly the paths Importing scans, and feeds the core. `pnpm hyper import`, `run` and Export's read-back all go through it, and their refusals and their wording do not change.
- A new browser-safe package holds the reader core, the aggregate lifecycle (`src/persistence/aggregate-lifecycle.ts`, with `isDeepStrictEqual` replaced), the memory `SpaceRepository` (`src/persistence/memory-space-repository.ts`) and the product resolution `src/http/space-host.ts` performs. It is registered the way every package is: an alias in `tsconfig.base.json` and `vitest.config.ts`, a narrowed `paths` in its own tsconfig, and a lint zone. `app` may import it only from `packages/app/src/mount/`, which a lint zone enforces, so no other application code reaches the lifecycle doors ADR 0078 keeps off the browser seam. It depends on `core`, `graph`, `persistence` and `http`, and `persistence` keeps the `StoredSpaceRepository` it extends, so no cycle forms.

**Depends on:** nothing.

**Acceptance:**

- The existing aggregate-directory tests run against the core with an in-memory map as well as through the disk shell, so the two cannot diverge.
- A structural test fails any `node:` import in the new package. `test/unit/codemirror-encapsulation.test.ts` is the prior art for an import guard.
- `pnpm hyper run` on the fixture behaves as before, and `test/integration/run-command.test.ts` and `hyper-cli.test.ts` pass unchanged.

## Answer

Built as `@project/aggregate` (`packages/aggregate`), registered like every other package: an alias in `tsconfig.base.json`, `vitest.config.ts` and `vitest.integration.config.ts`, the app's `workspace-aliases.ts` and the drag-benchmark Vite config, a narrowed `paths` in its own tsconfig and in `app`'s, a `no-restricted-imports` zone that bans every Node builtin, React and the render-only libraries, a coverage threshold pinned at what the unit suite holds, and a dependency of `app`.

- **The reader core** is `readAggregateFiles(directory, files: AggregateFiles, newId)`, `AggregateFiles` being `ReadonlyMap<string, Uint8Array>` of `/`-separated relative paths. It decodes with `TextDecoder('utf-8', { ignoreBOM: true })`, which keeps a byte order mark as `readFile(path, 'utf8')` did, joins diagnostic paths as strings, parses each Space with `parseSingleSpace` and admits each image with `admitImageFile`, then answers failures by the policy the directory reader had.
- **The scanned paths** are one function: `scannedAggregatePaths(paths: Iterable<string>): readonly string[]`. It is a list filter rather than a per-path predicate, because whether `x/resources/a.json` is read depends on whether `x/space.json` exists. It keeps `hyper.json`, each top-level directory holding a `space.json` (that file, then the `*.md` beside it and `resources/*.json` and `resources/*.md`), and the visible files directly in `images/`, in the order Import reads them. Nothing deeper is kept, so a sibling aggregate or a nested `hyper.json` is never searched for. The core reads only what this keeps.
- **The filesystem shell** stays in `src/aggregate-directory/`: `readAggregate` reads `hyper.json` (a missing one is the core's refusal, one that cannot be read is the discovery failure it was), then the files `scannedAggregateFiles` names, and hands the bytes to the core. `hyper import`, `hyper run`, `importFixture` and Export's read-back all reach the core. `readSingleSpace` stays a disk reader and calls `refuseSpaceDocument` from the package for its version refusal.
- **Moved into the package unchanged but for imports**: `identify-space.ts`, `ordinal.ts`, `src/persistence/space-repository.ts` (the `SpaceRepository` seam, which the memory repository implements), `memory-space-repository.ts`, `aggregate-lifecycle.ts` and the whole of `src/http/space-host.ts`. Split: `AggregateDirectoryError` and `parseSingleSpace` from `space-directory.ts`, and `IMAGES_DIRECTORY_NAME`, `imageFileName` and `admitImageFile` from `images.ts`. Root `src/`, its tests and scripts import all of these from `@project/aggregate`.
- **`isDeepStrictEqual` is replaced** in `classifyInitializedAggregate` by a comparison over the JSON values a schema parsed, with the same answers for them: primitives by `Object.is`, lists in order, and records by the same own keys. `packages/aggregate/test/aggregate-lifecycle.test.ts` holds it.
- **Tests**: every case in `test/unit/read-aggregate.test.ts` runs through `readAggregate` from disk and through `readAggregateFiles` over a map of every file under the directory, read or not, so the core does its own choosing. Two image cases join them, and three cases cover `scannedAggregatePaths`, one of them holding it equal to `scannedAggregateFiles` over a mixed directory on disk. `test/unit/aggregate-package-browser-safe.test.ts` fails any Node builtin, `node:` or bare, static or dynamic, imported from the package's sources.

Deliberate deviations:

- **`createSpaceHost` moved whole**, not only `resolveProductRequest`. The module has no Node import and composes the API with the product resolution, which is what an in-page host needs.
- **An unreadable file is refused before parsing.** The shell gathers every listing and read failure into one `discovery` refusal, each naming its path as before, and raises it before the core runs. Previously one Space's read failure was reported beside other Spaces' parse diagnostics in one refusal, and a Space whose `space.json` read but whose Resource file did not could be refused for its document version instead. This only changes I/O-failure cases (permissions, races). No test reached them and the CLI's label for the refusal (`File discovery failed`) is unchanged.
