# HTTP-Backed Automatic Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist browser edits through `HttpSpaceBackend` and bounded HTTP handlers to `SpaceRepository`, preserving the existing session's ordered optimistic writes, visible retry/rejection/conflict states, and lossless revisions.

**Architecture:** Three compositions are deliberate. Normal database runtime is `PostgresSpaceRepository -> Node HTTP handler -> HttpSpaceBackend`; standard database-free e2e is `E2eMemorySpaceRepository -> the same Node HTTP handler -> HttpSpaceBackend`; direct `MemorySpaceBackend` remains only for unit tests and isolated UX development. A thin Vite plugin loads the server composition through Vite's SSR module runner in development and a bundled SSR artifact in preview, so `vite.config.ts` never imports the transitive `@project/*` dependency graph that Node cannot execute directly.

**Tech Stack:** TypeScript 6 strict mode, Node 24 `http`, Fetch/AbortController, Vite 6 SSR module loading/build, Vitest 2, Playwright 1.49, Prisma Next 0.16.0, PostgreSQL 17.5.

## Global Constraints

- Issues 05 and 07 must be landed before execution. Task 1 is a hard preflight against their actual exports and behavior; do not invent a launch, selection, import, or zero-space seam in issue 08.
- Issue 05 alone owns file discovery/parsing/import. Issue 07 alone owns zero-space creation, one/many-space launch and selection, and deterministic selection of an imported UUID.
- Browser code knows only `SpaceBackend` and validated space UUIDs. It never receives `DATABASE_URL`, file paths, import paths, repository names, or arbitrary storage targets.
- HTTP resources are exactly `GET /api/spaces`, `GET /api/spaces/:uuid`, and `PUT /api/spaces/:uuid`.
- Commit request limit is 1,048,576 raw bytes. `Content-Type` accepts `application/json` case-insensitively with optional parameters. Missing/wrong content type, invalid/negative/noncanonical `Content-Length`, oversized input, malformed JSON/envelope/revision/snapshot, invalid path UUID, and path/snapshot mismatch return `400` without calling the repository. Unsupported methods on recognized resources return `405` with `Allow`; unknown paths fall through to Vite.
- Internal revisions are always `bigint`; wire revisions are canonical non-negative decimal strings. Never pass revisions through `Number`.
- Default browser timeout is exactly 10,000 ms, configurable only through `HttpSpaceBackendOptions` for tests. There is no automatic retry.
- Status precedence is status-first: `408`, `429`, and every `5xx` are retryable even when their body is empty, HTML, invalid JSON, or malformed JSON, using deterministic fallback messages. Malformed `200` and `409` bodies are permanent `protocol` failures.
- The handler validates transport/schema shape but does not call domain intake, implement optimistic concurrency, or implement transactions. `SpaceRepository` owns domain validation, revisions, and atomicity.
- Keep the Vite middleware host and add no HTTP framework. Production deployment lifecycle, TLS, authentication implementation, supervision, and non-Vite static hosting remain explicitly deferred.
- Standard `pnpm e2e` remains database-free and exercises HTTP. Direct `MemorySpaceBackend` is not an e2e composition.
- Standard e2e keeps `fullyParallel: true`. Every test owns one fresh Vite host, one fresh `E2eMemorySpaceRepository`, and one fresh catalog; reloads and multiple pages inside that test share them, while no repository or revision survives into another test.
- Apply strict TDD vertically: write one consumer-visible failing behavior before the production slice that satisfies it. Existing ADR 0028 route activation and navigation protection receive characterization coverage; do not manufacture RED or change production when they already pass.

---

### Task 1: Preflight the landed issue 05/07 contracts

**Files:**
- Inspect only: the files and tests added by issues 05 and 07
- Modify only if the preflight passes: this plan's execution notes, before implementation begins

**Responsibilities:**
- Record the actual landed file-import entry, programmatic import entry, launch/opening entry, selection result, zero-space creation behavior, and imported-id selection mechanism.
- Map those actual symbols to Tasks 5 and 7. Issue 08 adapts composition around them; it does not rename or replace them.

**Interfaces:**
- Consumes: the actual issue 05 server-side importer and actual issue 07 launch/selection contract.
- Produces: no code and no new interface.

- [ ] **Step 1: Inspect actual exports and tests**

Run:

```bash
rg -n "export .*import|export .*launch|export .*open|selected|zero|newSpace|listSpaces" src packages test
pnpm test
```

Read the matching issue 05/07 implementation tests. Write down the exact symbol names and types in the execution log.

- [ ] **Step 2: Verify required behaviors exist**

Confirm with existing tests that: zero stored spaces create and open a fully identified database space; one space opens directly; many spaces select through the landed UI/launch result; an import returns identities that can deterministically choose the imported space; and server-side fixture import does not require browser file values.

Expected: all behaviors are green before issue 08 changes anything.

- [ ] **Step 3: Stop if the prerequisite is absent**

If any behavior or callable seam is absent, stop issue 08 and finish issue 05/07. Do not add a speculative `openDatabaseWorkspace`, preferred-id query parameter, or replacement selection policy here.

- [ ] **Step 4: No commit**

This is a read-only gate.

### Task 2: Vertical slice — valid list, load, commit, and conflict over real HTTP

**Files:**
- Create: `packages/persistence/test/backend-contract.ts`
- Rename: `packages/persistence/test/backend.test.ts` to `packages/persistence/test/memory-backend.test.ts`
- Create: `packages/persistence/src/http-protocol.ts`
- Create: `packages/persistence/src/http.ts`
- Modify: `packages/persistence/src/index.ts`
- Create: `src/http/space-http-handler.ts`
- Create: `test/support/http-server.ts`
- Create: `test/support/e2e-memory-space-repository.ts`
- Create: `test/unit/http-backend-contract.test.ts`

**Responsibilities:**
- `backend-contract.ts` defines consumer-visible backend behavior without requiring list order.
- `http-protocol.ts` is the sole lossless JSON codec.
- `http.ts` implements `HttpSpaceBackend`.
- `space-http-handler.ts` translates fixed HTTP resources to repository results.
- The test repository implements repository semantics directly for real HTTP tests; it does not wrap `MemorySpaceBackend` and reclassify browser results.

**Interfaces:**
- Produces `HttpSpaceBackend(baseUrl = '/api/spaces', options?: { fetch?: typeof globalThis.fetch; timeoutMs?: number }) implements SpaceBackend`.
- Produces `type SpaceHttpHandler = (request: IncomingMessage, response: ServerResponse) => Promise<boolean>` and `createSpaceHttpHandler(repository: SpaceRepository): SpaceHttpHandler`.
- Produces strict codecs `encode/decodeLoadedSpace`, `encode/decodeCommitRequest`, `decodeSpaceSummaries`, `decodeCommittedRevision`, and `decodeErrorMessage`.
- Produces `spaceBackendContract(name, createHarness)` used unchanged by memory and HTTP.

- [ ] **Step 1: RED — run the same valid contract against real HTTP**

Write the shared suite first. It must compare summaries as an order-independent set, load a complete snapshot, return `undefined` for an absent UUID, commit an authoritative complete snapshot, preserve `exportedRevision`, return the committed revision, and return current durable state for a stale conflict. Its invalid case must remain schema-valid while adding a route edge whose destination UUID is absent from `cards`; both backends must return permanent `invalid-snapshot`, proving normal domain intake rather than transport parsing rejected it.

The HTTP invocation is real:

```ts
spaceBackendContract('HttpSpaceBackend', async (initial) => {
  const repository = new E2eMemorySpaceRepository(initial);
  const server = await startHttpServer(createSpaceHttpHandler(repository));
  return {
    backend: new HttpSpaceBackend(`${server.url}/api/spaces`),
    close: server.close,
  };
});
```

Include `9_007_199_254_740_993n` as the loaded revision. Commit with that exact expected revision, expect `9_007_199_254_740_994n`, then make a stale commit and expect a conflict whose current loaded revision is still `9_007_199_254_740_994n`. This proves load, expected revision, committed response, and conflict current state beyond `MAX_SAFE_INTEGER` through actual sockets.

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- test/unit/http-backend-contract.test.ts packages/persistence/test/memory-backend.test.ts`

Expected: memory contract PASS; HTTP contract FAIL because backend, handler, and codecs do not exist.

- [ ] **Step 3: GREEN — implement only the valid vertical path**

Wire shapes are exact:

```ts
type WireLoadedSpace = {
  snapshot: SpaceSnapshot;
  revision: string;
  exportedRevision: string | null;
};
type CommitRequestBody = {
  snapshot: SpaceSnapshot;
  expectedRevision: string;
};
```

Parse revisions only when `/^(0|[1-9]\d*)$/` matches, then call `BigInt`. Validate summaries with UUID plus non-empty title, loaded/commit snapshots with `spaceSnapshotSchema`, and exact object keys. Handler responses set `Content-Type: application/json; charset=utf-8` and `Cache-Control: no-store`. Map repository committed to `200`, conflict to `409`, missing load to `404`, and rejected `not-found`/`invalid-snapshot` to `404`/`422`.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command.

Expected: both contract invocations PASS, including every >`MAX_SAFE_INTEGER` assertion.

- [ ] **Step 5: REFACTOR and verify**

Extract private exact-record and revision parsers in `http-protocol.ts`, and private JSON response/routing helpers in the handler. Keep repository/session policy out.

Run: `pnpm test -- test/unit/http-backend-contract.test.ts packages/persistence/test/memory-backend.test.ts && pnpm --filter @project/persistence typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/persistence/src packages/persistence/test src/http/space-http-handler.ts test/support test/unit/http-backend-contract.test.ts
git commit -m "feat: persist spaces through HTTP"
```

### Task 3: Vertical slice — complete transport classification and timeout

**Files:**
- Create: `packages/persistence/test/http-failures.test.ts`
- Modify: `packages/persistence/src/http.ts`
- Modify: `packages/persistence/src/http-protocol.ts`

**Responsibilities:**
- Status classification takes precedence over response parsing for retryable statuses.
- Success/conflict parsing stays strict.
- Fetch rejection and the adapter's own timeout remain distinguishable.

**Interfaces:**
- Preserves existing `CommitResult` exactly.
- Default timeout: `10_000` ms.
- `Retry-After` accepts non-negative decimal seconds and becomes integer milliseconds; invalid values are omitted.

- [ ] **Step 1: RED — table-test every mapping**

Use a behavior fake for Fetch and assert returned `CommitResult`, not mock call counts:

```ts
const cases = [
  [400, 'protocol', 'permanent-failure'],
  [401, 'forbidden', 'permanent-failure'],
  [403, 'forbidden', 'permanent-failure'],
  [404, 'not-found', 'permanent-failure'],
  [422, 'invalid-snapshot', 'permanent-failure'],
  [408, 'timeout', 'retryable-failure'],
  [429, 'rate-limited', 'retryable-failure'],
  [500, 'unavailable', 'retryable-failure'],
  [503, 'unavailable', 'retryable-failure'],
] as const;
```

For each `408`, `429`, and `5xx`, repeat with empty, HTML, invalid JSON, and wrong-shaped JSON bodies. Expect status-specific fallback messages: `Request timed out`, `Rate limited`, and `Persistence service unavailable`. A valid error `{message}` overrides the fallback. Assert `429 Retry-After: 2` yields `retryAfterMs: 2000`.

Also assert malformed `200` and malformed `409` are permanent `protocol`, unexpected `4xx` is permanent `protocol`, rejected Fetch is retryable `network`, and an adapter-owned abort at exactly `timeoutMs` is retryable `timeout`. Caller-provided Fetch is still governed by the adapter timeout.

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- packages/persistence/test/http-failures.test.ts`

Expected: FAIL at status-first malformed-body handling.

- [ ] **Step 3: GREEN — implement status-first classification**

Branch on `response.status` before attempting error JSON for `408`, `429`, or `>=500`. Read a message opportunistically and use the deterministic fallback when parsing fails. Parse `200` committed and `409` conflict bodies strictly. Use one private timed-fetch helper that owns its `AbortController` and clears its timer in `finally`.

- [ ] **Step 4: Verify GREEN, refactor, and commit**

Run: `pnpm test -- packages/persistence/test/http-failures.test.ts test/unit/http-backend-contract.test.ts`

Expected: PASS. Extract `retryableForStatus` only after green and rerun.

```bash
git add packages/persistence/src/http.ts packages/persistence/src/http-protocol.ts packages/persistence/test/http-failures.test.ts
git commit -m "feat: classify HTTP persistence failures"
```

### Task 4: Vertical slice — bounded request validation and reusable connections

**Files:**
- Create: `test/unit/space-http-validation.test.ts`
- Modify: `src/http/space-http-handler.ts`
- Modify: `test/support/http-server.ts`

**Responsibilities:**
- Reject malformed transport before repository access.
- Drain an over-limit stream without buffering further bytes, send one `400`, and leave the keep-alive server usable.

**Interfaces:**
- Produces `MAX_COMMIT_BODY_BYTES = 1_048_576`.
- `Content-Length` must be one canonical non-negative decimal integer and must not exceed the limit.
- Streaming overflow returns `400 {message:'Request body exceeds 1048576 bytes'}` after draining through `request.resume()`/end; it does not destroy the socket.

- [ ] **Step 1: RED — enumerate transport rejection**

Through a real Node server, test missing/wrong media type, malformed JSON, arrays, extra envelope keys, invalid revision, schema-invalid snapshot, invalid path UUID, path/snapshot mismatch, negative/noncanonical/conflicting `Content-Length`, declared oversize, and chunked streaming oversize. Every case expects `400` and zero repository calls. Unsupported method expects `405` plus `Allow`; an unrelated path returns `false` to a test fallback handler.

For streaming overflow, send more than the limit on a keep-alive agent, receive exactly one `400`, then send a valid commit over the same agent and expect `200`. Assert the repository saw only the second request. This proves drain/termination and continued server usability.

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- test/unit/space-http-validation.test.ts`

Expected: FAIL on the first request that reaches the repository or makes the connection unusable.

- [ ] **Step 3: GREEN — implement bounded reading**

Normalize the media type by splitting at `;`, trimming, and lowercasing. Reject invalid headers before reading. While streaming, count `Buffer.byteLength` of raw chunks; once over limit, stop appending, call `request.resume()`, wait for `end`, and then send the single `400`. Decode UTF-8/JSON only when bounded. Use the shared strict commit decoder and compare path UUID to `snapshot.id`. Do not call `loadSpaceSnapshot`.

- [ ] **Step 4: Verify GREEN, refactor, and commit**

Run: `pnpm test -- test/unit/space-http-validation.test.ts test/unit/http-backend-contract.test.ts`

Expected: PASS with the second keep-alive request committed.

```bash
git add src/http/space-http-handler.ts test/unit/space-http-validation.test.ts test/support/http-server.ts
git commit -m "feat: bound HTTP commit requests"
```

### Task 5: Vertical slice — Node-safe Vite hosting and concrete database-free fixture server

**Files:**
- Create: `packages/app/vite-space-http-plugin.ts`
- Create: `packages/app/http-server-build.config.ts`
- Create: `src/http/postgres-http-runtime.ts`
- Create: `test/support/e2e-http-runtime.ts`
- Create: `test/support/import-fixture.ts`
- Create: `test/unit/vite-space-http-plugin.test.ts`
- Create: `test/unit/e2e-http-runtime.test.ts`
- Modify: `packages/app/e2e/fixtures.ts`
- Modify: `packages/app/vite.config.ts`
- Modify: `packages/app/package.json`
- Modify: `package.json`
- Modify: `packages/app/tsconfig.json`
- Modify: `playwright.config.ts`
- Delete: `packages/app/vite-space-file-plugin.ts`
- Delete: `packages/app/src/virtual-space-file.d.ts`

**Responsibilities:**
- The thin plugin imports no `@project/*` module and no local module whose config-time dependency graph contains them.
- Development uses `ViteDevServer.ssrLoadModule()` to transform the selected server runtime; preview dynamically imports the SSR bundle built by `http-server-build.config.ts`.
- Normal runtime selects `src/http/postgres-http-runtime.ts` server-side.
- Standard e2e selects `test/support/e2e-http-runtime.ts` server-side. Keeping the runtime beside the shared repository avoids an illegal relative escape from an app package. Each call to `createHandler({ catalog })` creates a new instance of the single shared `test/support/e2e-memory-space-repository.ts` implementation, imports the requested fixture through issue 05's landed server-side importer, and exposes the same handler. Browser code still uses `HttpSpaceBackend`.

**Interfaces:**
- Produces `spaceHttpPlugin({ developmentModule, previewModule, runtimeOptions }): Plugin` where module paths/options are fixed by server configuration, never browser input.
- Normal runtime exports `createHandler(): Promise<SpaceHttpHandler>`; e2e runtime exports `createHandler({ catalog: 'fixture' | 'empty' }): Promise<SpaceHttpHandler>`.
- Root scripts: `http-server:build`, run before `build`/`preview`. Standard e2e has no shared Playwright `webServer`; its test fixture starts and stops Vite per test.

- [ ] **Step 1: RED — prove config-time isolation and both middleware hooks**

Test that `configureServer` calls the supplied `ssrLoadModule` once, handles API requests without `next`, and falls through for assets. Test `configurePreviewServer` loads the built runtime through an injected module loader. Rejecting runtime/handler promises call `next(error)`. The plugin test imports successfully in plain Node without resolving `@project/*`.

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- test/unit/vite-space-http-plugin.test.ts`

Expected: FAIL because the thin host does not exist.

- [ ] **Step 3: GREEN — implement the Node-safe boundary**

Keep `vite.config.ts -> vite-space-http-plugin.ts` config-time graph limited to Vite and Node types. `ssrLoadModule` transforms normal/e2e runtime graphs in development. The dedicated SSR build runs with app as root, where workspace dependencies exist, and sets `ssr.noExternal` for `@project/core`, `@project/graph`, and `@project/persistence`, producing one self-contained Node ESM runtime for preview. Do not add Vite aliases or rewrite authored repository imports.

- [ ] **Step 4: Verify GREEN and build artifact execution**

Run: `pnpm test -- test/unit/vite-space-http-plugin.test.ts && pnpm http-server:build && node -e "import('./packages/app/dist-http/postgres-http-runtime.js').then(m => console.log(typeof m.createHandler))"`

Expected: tests PASS and command prints `function` without an unresolved `@project/*` or extensionless-import error.

- [ ] **Step 5: RED — specify the server-side fixture replacement**

Add a focused e2e-server integration test that calls `createHandler({ catalog: 'fixture' })`, serves it, calls `GET /api/spaces`, and loads the known abstract-layout fixture UUID. Call the factory a second time, commit only through the first handler, and prove the second handler still has the fixture's initial revision. Also call `createHandler({ catalog: 'empty' })` and prove it begins with an empty list. This names the per-test reset boundary before browser wiring exists. Leave the virtual implementation untouched until this test has failed for the missing runtime.

- [ ] **Step 6: Verify RED**

Run: `pnpm test -- test/unit/e2e-http-runtime.test.ts`

Expected: FAIL until `import-fixture.ts` calls issue 05's actual landed server-side importer and seeds the in-memory repository.

- [ ] **Step 7: GREEN — implement the concrete e2e fixture composition**

`test/support/import-fixture.ts` passes `packages/app/fixture` to the actual issue 05 importer recorded in Task 1. `test/support/e2e-http-runtime.ts` imports and instantiates its sibling `E2eMemorySpaceRepository`; it must not declare another repository class or adapter. `catalog: 'fixture'` seeds that new instance once, while `catalog: 'empty'` leaves it empty for issue 07 zero-space behavior. Each factory call closes over only its own repository.

- [ ] **Step 8: Verify GREEN, then remove the superseded virtual path**

Run: `pnpm test -- test/unit/e2e-http-runtime.test.ts test/unit/vite-space-http-plugin.test.ts`

Expected: PASS through two independent server-side fixture repositories and one empty repository. Only now delete `virtual:space-file`, `SPACE_DIR` client seeding, invalid-file browser startup, and Save/read-only-era tests after confirming issue 05/07 own their replacement coverage.

Update `packages/app/e2e/fixtures.ts` with a test-scoped automatic `e2eServer` fixture. It calls Vite `createServer` with `configFile` fixed to the app config, `server.port: 0`, and mode `e2e-fixture` for the normal project or `e2e-empty` for the issue 07 zero-space project. The Vite config maps those two server-only modes to the fixed e2e runtime module and its literal catalog option. After `listen()`, the fixture creates a browser context whose `baseURL` is that server's resolved loopback URL, supplies its `page`, then closes the context and Vite server in `finally`. Remove standard `webServer` entries from `playwright.config.ts` and retain `fullyParallel: true`.

This lifecycle is test-scoped, not worker-scoped: all reloads and extra pages created from the supplied context during one test share one repository/catalog, which is required for durability and stale-conflict tests. The next test—even on the same Playwright worker—constructs a new Vite module graph and repository, so card positions and revisions cannot race or leak across tests.

- [ ] **Step 9: Verify the refactor, browser-bundle isolation, and commit**

Run: `pnpm test -- test/unit/e2e-http-runtime.test.ts test/unit/vite-space-http-plugin.test.ts && pnpm build && rg -n "DATABASE_URL|PostgresSpaceRepository|space.json|virtual:space-file" packages/app/dist/assets`

Expected: tests/build PASS and `rg` returns no browser-bundle matches.

```bash
git add packages/app/vite-space-http-plugin.ts packages/app/http-server-build.config.ts src/http/postgres-http-runtime.ts test/support/e2e-http-runtime.ts test/support/import-fixture.ts packages/app/e2e/fixtures.ts test/unit packages/app/vite.config.ts packages/app/package.json package.json packages/app/tsconfig.json playwright.config.ts
git rm packages/app/vite-space-file-plugin.ts packages/app/src/virtual-space-file.d.ts
git commit -m "feat: host persistence through Vite HTTP"
```

### Task 6: Adapt the landed issue 07 browser launch composition

**Files:**
- Modify: the actual issue 07 browser composition file identified in Task 1
- Modify: its existing launch/selection tests

**Responsibilities:**
- Replace only its database-backed `SpaceBackend` construction with `new HttpSpaceBackend('/api/spaces')`.
- Preserve issue 07's actual zero/one/many-space and imported-id selection behavior unchanged.
- Preserve an explicit direct `MemorySpaceBackend` injection only in unit/isolated UX tests.

**Interfaces:**
- Consumes exactly the landed issue 07 contract recorded by Task 1; produces no new launch or selection API.

- [ ] **Step 1: RED — extend the landed composition test at its public seam**

Against a real e2e HTTP server, prove the landed launcher lists/loads via `HttpSpaceBackend`, follows its existing zero-space creation behavior, and uses its existing imported UUID selection result. Do not restate expected selection policy in a new helper.

- [ ] **Step 2: Verify RED**

Run the exact issue 07 focused test command recorded in Task 1.

Expected: FAIL because database-backed composition still constructs its former backend.

- [ ] **Step 3: GREEN — replace the composition dependency only**

Construct `HttpSpaceBackend('/api/spaces')` at the existing composition root and pass it through the landed issue 07 seam. Do not modify selection branches, zero-space creation, imported-id routing, or UI copy.

- [ ] **Step 4: Verify GREEN and commit**

Run the focused issue 07 tests plus `pnpm --filter @project/app typecheck`.

Expected: PASS with existing launch assertions unchanged.

```bash
git add packages/app/src packages/app/test
git commit -m "feat: open database workspaces over HTTP"
```

### Task 7: Browser integration coverage through the HTTP composition

**Files:**
- Create: `packages/app/e2e/http-persistence.spec.ts`
- Modify: `packages/app/e2e/fixtures.ts` only for HTTP interception helpers; its isolated server/context lifecycle was established in Task 5
- Modify: `packages/app/e2e/editing.spec.ts`
- Delete: `packages/app/e2e/read-only.spec.ts` after issue 05 replacement coverage is confirmed

**Responsibilities:**
- Prove the browser/session/backend/handler chain while the test-scoped server uses the one shared `E2eMemorySpaceRepository` implementation.
- Keep existing behavior tests as characterization when no production change is expected.

**Interfaces:**
- No production interface. Test helpers hold/count/reject PUTs through Playwright routing.

- [ ] **Step 1: INTEGRATION CHARACTERIZATION — ordered rapid edits and reload durability**

Hold the first PUT, complete two card drags, release it, and assert exactly two PUTs. Assert the second request carries the first response's decimal revision and the final position survives page reload. Fix only HTTP/runtime boundary defects; ordering remains solely in `SpaceSession`.

- [ ] **Step 2: Verify the integration behavior**

Run: `pnpm e2e -- --project chromium packages/app/e2e/http-persistence.spec.ts -g 'rapid edits'`

Expected: PASS because Tasks 2–6 already established the behavior at lower seams. If it exposes a real integration regression, preserve that observed failure before making the minimal boundary fix.

- [ ] **Step 3: INTEGRATION CHARACTERIZATION — network retry and two-client stale conflict**

Abort exactly one PUT, assert `Retry persistence`, remove interception, click retry, and assert one revision increment. Open two pages at the same revision, commit A, edit B, assert `Accept remote`, assert no blind third PUT, accept remote, and assert A's position is installed.

- [ ] **Step 4: Verify the integration behavior**

Run: `pnpm e2e -- --project chromium packages/app/e2e/http-persistence.spec.ts -g 'retry|conflict'`

Expected: PASS. If either test reveals a mapping/wiring regression, retain the failure before fixing it; never add automatic retry.

- [ ] **Step 5: CHARACTERIZATION — route activation and navigation protection**

Count PUTs while activating/presenting a route and assert zero. Hold/abort/conflict PUTs and assert `beforeunload` protection exists only while pending/failed/conflicted; after `Persisted`, reload without a dialog. The stale-conflict test creates both pages from the same test-scoped browser context/base URL, so they share exactly one repository; reload also stays inside that same server lifetime. If existing behavior passes, change no production. If it reveals a genuine regression at HTTP integration, retain the observed failure before fixing it.

- [ ] **Step 6: Verify all database-free e2e and commit**

Run: `pnpm e2e`

Expected: PASS with every browser using `HttpSpaceBackend`, no database, no React Flow warnings, and no page errors.

```bash
git add packages/app/e2e
git commit -m "test: cover HTTP persistence in browsers"
```

### Task 8: Isolated PostgreSQL durability across a Vite-host restart

**Files:**
- Create: `playwright.postgres.config.ts`
- Create: `packages/app/e2e/postgres-persistence.spec.ts`
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `.scratch/database-persistence/issues/08-http-backed-automatic-persistence.md`

**Responsibilities:**
- Separate opt-in PostgreSQL browser test owns two sequential Vite host instances.
- Test data is unique, selected through issue 07's actual imported-id mechanism, and cleaned without touching unrelated spaces.
- Verification always shuts PostgreSQL down.

**Interfaces:**
- Root script `e2e:postgres` runs only `playwright.postgres.config.ts`.
- Consumes actual issue 05 programmatic import and issue 07 imported-id selection recorded in Task 1.

- [ ] **Step 1: RED — write isolated restart durability**

Generate a unique space/card/layout UUID set, import it through issue 05, retain the returned imported space UUID, and launch the app through issue 07's actual imported-id selection mechanism. Start Vite on `127.0.0.1:5276`, drag, wait for `Persisted`, capture position/revision, close browser context and Vite, start a fresh Vite host against the same database, select the same UUID through the landed mechanism, and assert identical position/revision.

In `finally`, delete only the unique test space through a test-support repository cleanup transaction (cards then space); assert a subsequent repository load is `undefined`. Never truncate all Hyper data.

- [ ] **Step 2: Verify RED**

Run: `pnpm postgres:up && pnpm e2e:postgres; test_status=$?; pnpm postgres:down; exit $test_status`

Expected: PostgreSQL starts, test fails at missing runtime/selection integration, and PostgreSQL shuts down regardless.

- [ ] **Step 3: GREEN — add the opt-in harness**

Use one nonparallel Playwright project with no `webServer` block because the test owns both Vite instances. Use nested `try/finally` for browser, Vite hosts, unique row cleanup, and database command wrapper. Do not reuse standard e2e's memory repository.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm postgres:up && pnpm e2e:postgres; test_status=$?; pnpm postgres:down; exit $test_status`

Expected: PASS and infrastructure stopped.

- [ ] **Step 5: Full verification**

Run: `pnpm verify && pnpm e2e`

Expected: PASS.

Run: `pnpm postgres:up && pnpm test:integration:postgres && pnpm e2e:postgres; test_status=$?; pnpm postgres:down; exit $test_status`

Expected: integration and browser persistence PASS; PostgreSQL always stops.

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only issue 08 files plus the issue answer.

- [ ] **Step 6: Record answer and commit**

Append `## Answer` with evidence for the three compositions, request bound/mappings, >`MAX_SAFE_INTEGER` real-HTTP coverage, Vite Node-safe boundary, browser retry/conflict/order characterization, PostgreSQL restart/cleanup, and deferred deployment lifecycle.

```bash
git add playwright.postgres.config.ts packages/app/e2e/postgres-persistence.spec.ts package.json tsconfig.json .scratch/database-persistence/issues/08-http-backed-automatic-persistence.md
git commit -m "test: prove PostgreSQL HTTP durability"
```

## Final Self-Review Checklist

- [ ] Three compositions are explicit and noncontradictory; every standard e2e browser uses `HttpSpaceBackend`.
- [ ] `E2eMemorySpaceRepository` is defined only in `test/support/e2e-memory-space-repository.ts` and is reused by the real-HTTP backend contract and e2e runtime.
- [ ] Every fully-parallel standard e2e test owns a fresh Vite host/repository/catalog; reload and multi-page conflict stay inside that test's lifetime.
- [ ] Issue 05/07 are prerequisites consumed at their actual landed seams; issue 08 invents no launch/selection behavior.
- [ ] Vite config-time code cannot reach transitive `@project/*`; development SSR loading and preview SSR bundling are concrete and tested.
- [ ] Virtual file input has a named server-side replacement with repository, runtime, fixture importer, scripts, and tests.
- [ ] Every new production slice has RED before GREEN; existing route/navigation behavior is characterization.
- [ ] Real HTTP contract covers load, expected, committed, and conflict revisions above `MAX_SAFE_INTEGER`.
- [ ] Retryable status precedence, fallback messages, timeout, path/media/header outcomes, streaming drain, repository non-access, and keep-alive reuse are specified.
- [ ] Shared invalid-snapshot coverage uses a schema-valid snapshot with a dangling route edge, proving repository domain rejection rather than transport rejection.
- [ ] Shared list assertions are order-independent.
- [ ] PostgreSQL data is unique, deterministically selected, narrowly cleaned, and every verification path calls `postgres:down`.
- [ ] `rg -n '[T]BD|[T]ODO|implement[ ]later|appropriate[ ]error|handle[ ]edge[ ]cases|similar[ ]to' docs/superpowers/plans/2026-07-29-http-backed-automatic-persistence.md` returns no matches.
