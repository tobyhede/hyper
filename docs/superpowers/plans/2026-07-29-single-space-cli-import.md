# Single-Space CLI Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import one `space.json` file or one space directory into PostgreSQL, allocate every missing durable identity transactionally, and report the imported stored space and UUID.

**Architecture:** A Node-only file adapter discovers and parses the complete directory into `ImportSpace` before calling the repository. `PostgresSpaceRepository.importSpaces` remains the shared programmatic/file import core: inside one callback transaction it reserves the target space, asks PostgreSQL for missing UUIDs, constructs and domain-validates a complete `SpaceSnapshot`, then performs additive inserts/upserts. A thin CLI reports the returned `StoredSpace`; database workspace selection and opening remain issue 07.

**Tech Stack:** TypeScript 6 strict mode, Zod 3, YAML, Node 24 filesystem APIs, Prisma Next 0.16.0, PostgreSQL 17.5, tsx 4.20.6, Vitest.

## Global Constraints

- Keep the physical interchange shape as `space.json`, root `*.md`, and immediate `cards/*.md`; discovery is non-recursive.
- Parse the complete filesystem input before `SpaceRepository.importSpaces` opens its write transaction.
- Keep entity ids and UUID references UUID-only; built-in `defaultView` values remain `graph` or `grid`. There is no import-local key and filenames never become identity.
- An id-less card, route, or layout must be unreferenced; normal domain validation rejects a UUID reference that has no explicitly identified target.
- PostgreSQL allocates every missing space, card, route, and layout UUID inside the import transaction.
- An explicit UUID upserts; an absent id inserts a new entity. Ordinary import never deletes by absence.
- Keep `Space`, `SpaceSnapshot`, and every repository read fully identified.
- Keep database, filesystem, and CLI modules outside browser-safe workspace packages.
- Use callback transactions and authored database imports only through the `@prisma-next/postgres` facade.
- Preserve PostgreSQL `bigint` revisions without conversion through JavaScript `number`.
- Follow strict RED → verify RED → GREEN → verify GREEN → refactor → verify GREEN → commit cycles.
- Run `pnpm verify`; no UI or graph rendering changes are planned, so `pnpm e2e` is not required.

---

## File Structure

- `packages/core/src/schema.ts` — owns id-optional import-file/frontmatter schemas and fully identified persistence schemas.
- `packages/core/src/types.ts` — exports `ImportCard` and `ImportSpaceFile` derived from the new schemas.
- `packages/core/test/persistence-schema.test.ts` — proves only entity ids become optional and references remain UUID-only.
- `packages/graph/src/card-file.ts` — parses Markdown card files into either fully identified `Card` values or id-optional `ImportCard` values without performing I/O.
- `packages/graph/test/card-file.test.ts` — pins id-optional import frontmatter, body handling, aliases, and path-bearing parse errors.
- `src/import/read-single-space.ts` — performs Node filesystem discovery and complete file parsing for exactly one space.
- `test/unit/read-single-space.test.ts` — exercises real temporary directories, non-recursive discovery, file/directory inputs, and parse diagnostics.
- `src/persistence/space-repository.ts` — changes the shared import contract from identified snapshots to `ImportSpace` inputs.
- `src/persistence/postgres-space-repository.ts` — allocates missing UUIDs, resolves one import into a snapshot, validates it, and writes it atomically.
- `test/integration/postgres-space-repository.test.ts` — proves explicit upsert, id-less insertion, UUID allocation, invalid-reference rejection, ownership rejection, and rollback against PostgreSQL.
- `src/import/import-single-space.ts` — composes the file adapter with the same repository import method used by programmatic callers.
- `test/unit/import-single-space.test.ts` — proves discovery/parsing finishes before repository mutation and normalizes the one-space result.
- `src/cli/run.ts` — maps arguments and typed import outcomes to stable stdout/stderr text and exit codes.
- `src/cli/main.ts` — classifies database shutdown failure around the pure CLI runner.
- `src/cli/entry.ts` — constructs the real repository, invokes the classified main function, and sets `process.exitCode`.
- `test/unit/hyper-cli.test.ts` — covers argument validation and result/error reporting through the real CLI runner.
- `test/integration/hyper-cli.test.ts` — spawns the actual `pnpm hyper` command against PostgreSQL and verifies the durable stored aggregate.
- `package.json` and `pnpm-lock.yaml` — add the `hyper` script and the pinned TypeScript runner.
- `.scratch/database-persistence/issues/05-single-space-cli-import.md` — records verification evidence and the final answer after implementation.

---

### Task 1: Id-Optional File and Card Parsing

**Files:**
- Modify: `packages/core/src/schema.ts`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/test/persistence-schema.test.ts`
- Modify: `packages/graph/src/card-file.ts`
- Modify: `packages/graph/test/card-file.test.ts`

**Interfaces:**
- Consumes: existing `uuidSchema`, `spaceFileSchema`, `cardFrontmatterSchema`, `splitFrontmatter`, and `ImportSpace`.
- Produces: `importCardFrontmatterSchema`, `importSpaceFileSchema`, `ImportCard`, `ImportSpaceFile`, and `parseImportCardFile(file: CardFile): ParseImportCardFileResult`.
- Produces: `ParseImportCardFileResult = { ok: true; card: ImportCard } | { ok: false; errors: CardFileError[] }`.
- Preserves: `parseCardFile(file: CardFile): ParseCardFileResult` and its fully identified `Card` output.

- [ ] **Step 1: RED — specify that file-shaped import permits absent entity ids but not non-UUID references**

Add this case to `packages/core/test/persistence-schema.test.ts`:

```ts
it('keeps references UUID-only when import entity ids are absent', () => {
  const parsed = importSpaceFileSchema.parse({
    version: 2,
    title: 'Import input',
    routes: [
      {
        title: 'Generated route',
        edges: [{ from: CARD_A, to: CARD_B }],
      },
    ],
    layouts: [
      {
        title: 'Generated layout',
        positions: { [CARD_A]: { x: 0, y: 0 } },
      },
    ],
  });

  expect(parsed.id).toBeUndefined();
  expect(parsed.routes[0]?.id).toBeUndefined();
  expect(parsed.layouts?.[0]?.id).toBeUndefined();
  expect(
    importSpaceFileSchema.safeParse({
      ...parsed,
      routes: [{ ...parsed.routes[0], edges: [{ from: 'card-a', to: CARD_B }] }],
    }).success,
  ).toBe(false);
});
```

- [ ] **Step 2: Verify RED for the import-file schema**

Run: `pnpm test packages/core/test/persistence-schema.test.ts`

Expected: FAIL because `importSpaceFileSchema` is not exported.

- [ ] **Step 3: GREEN — derive the import-file schema without weakening normal files**

In `packages/core/src/schema.ts`, export the import-file schema without yet adding an import-card parser schema:

```ts
export const importSpaceFileSchema = spaceFileSchema.extend({
  id: uuidSchema.optional(),
  routes: z.array(importRouteSchema),
  layouts: z.array(importLayoutSchema).optional(),
});

export const importSpaceSchema = z.object({
  id: uuidSchema.optional(),
  document: importSpaceFileSchema.omit({ id: true }),
  cards: z.array(z.object({ id: uuidSchema.optional(), document: cardDocumentSchema })),
});
```

In `types.ts`, derive and export:

```ts
export type ImportCard = z.infer<typeof importSpaceSchema>['cards'][number];
export type ImportSpaceFile = z.infer<typeof importSpaceFileSchema>;
```

- [ ] **Step 4: Verify GREEN for import schemas**

Run: `pnpm test packages/core/test/persistence-schema.test.ts`

Expected: PASS.

- [ ] **Step 5: RED — specify Markdown parsing without an id**

Add to `packages/graph/test/card-file.test.ts`:

```ts
it('parses an id-less Markdown file only through the import intake', () => {
  const file = {
    path: 'cards/new.md',
    text: '---\ntitle: New card\nkind: markdown\n---\n\nNew body\n',
  };

  expect(parseCardFile(file).ok).toBe(false);
  expect(parseImportCardFile(file)).toEqual({
    ok: true,
    card: {
      document: { title: 'New card', kind: 'markdown', body: '\nNew body\n' },
    },
  });
});
```

Add this alias case in the same RED step:

```ts
it('keeps an id-less alias target UUID-only and bodyless', () => {
  expect(
    parseImportCardFile({
      path: 'cards/alias.md',
      text: `---\ntitle: Alias\nkind: alias\ntarget: ${CARD_A}\n---\n`,
    }),
  ).toEqual({
    ok: true,
    card: { document: { title: 'Alias', kind: 'alias', target: CARD_A } },
  });
  expect(
    parseImportCardFile({
      path: 'cards/alias.md',
      text: '---\ntitle: Alias\nkind: alias\ntarget: card-a\n---\nBody',
    }).ok,
  ).toBe(false);
});
```

- [ ] **Step 6: Verify RED for import card parsing**

Run: `pnpm test packages/graph/test/card-file.test.ts`

Expected: FAIL because `parseImportCardFile` is not exported.

- [ ] **Step 7: GREEN — add the id-optional parser while sharing byte-level behavior**

Now add `importMarkdownCardFrontmatterSchema`, `importAliasCardFrontmatterSchema`, and `importCardFrontmatterSchema` to `packages/core/src/schema.ts`. Extract the existing missing-`kind` preprocessing callback into `defaultMarkdownKind`, just as `defaultPositionedKind` serves both normal and import layout schemas. Implement `parseImportCardFile` in `packages/graph/src/card-file.ts`. Refactor the existing parser into one private frontmatter/body decoder so both public functions retain identical fence, YAML, default-kind, alias-body, and path-bearing diagnostic behavior. Construct the import output exactly as:

```ts
const { id, ...document } = candidate;
return {
  ok: true,
  card: { ...(id === undefined ? {} : { id }), document },
};
```

Do not make `parseCardFile` accept absent ids.

- [ ] **Step 8: Verify GREEN, refactor, and re-verify Task 1**

Run: `pnpm test packages/core/test/persistence-schema.test.ts packages/graph/test/card-file.test.ts`

Expected: PASS with no warnings.

- [ ] **Step 9: Commit Task 1**

```bash
git add packages/core/src/schema.ts packages/core/src/types.ts packages/core/test/persistence-schema.test.ts packages/graph/src/card-file.ts packages/graph/test/card-file.test.ts
git commit -m "feat: parse id-optional import files"
```

### Task 2: Single-Space Filesystem Adapter

**Files:**
- Create: `src/import/read-single-space.ts`
- Create: `test/unit/read-single-space.test.ts`

**Interfaces:**
- Consumes: `importSpaceFileSchema`, `importSpaceSchema`, `parseImportCardFile`, and Node `fs/promises` APIs.
- Produces: `class SpaceImportFileError extends Error { kind: 'discovery' | 'parsing'; diagnostics: readonly string[] }`.
- Produces: `readSingleSpace(inputPath: string): Promise<ImportSpace>`.
- Guarantees: the input is resolved to one absolute path; a file input is parsed as that space file; a directory input reads `<directory>/space.json`; the combined root `*.md` and immediate `cards/*.md` list is globally sorted by root-relative path.

- [ ] **Step 1: RED — specify file and directory inputs with non-recursive card discovery**

In `test/unit/read-single-space.test.ts`, use `mkdtemp`, `mkdir`, and `writeFile` to create:

```text
talk/space.json
talk/root.md
talk/cards/detail.md
talk/cards/nested/ignored.md
talk/notes/ignored.md
```

Give `root.md` an explicit UUID and `detail.md` no id. Add `a.md` at the root and `cards/z.md` so per-directory concatenation would expose a different order from a global sort. Assert both `readSingleSpace(talk)` and `readSingleSpace(talk/space.json)` return the same literal `ImportSpace`, with only the in-scope cards ordered by `a.md`, `cards/detail.md`, `cards/z.md`, `root.md`, and with `detail.md` represented without `id`.

- [ ] **Step 2: Verify RED for discovery**

Run: `pnpm test test/unit/read-single-space.test.ts`

Expected: FAIL because `readSingleSpace` does not exist.

- [ ] **Step 3: GREEN — implement deterministic, non-recursive discovery**

Implement these private helpers in `src/import/read-single-space.ts`:

```ts
const resolveSpaceFile = async (inputPath: string): Promise<string> => {
  const absoluteInput = resolve(inputPath);
  return (await stat(absoluteInput)).isDirectory()
    ? join(absoluteInput, 'space.json')
    : absoluteInput;
};

const markdownFilesIn = async (directory: string): Promise<string[]> =>
  (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(directory, entry.name));
```

Resolve the caller's input once, derive every later path from that absolute path, combine both discovery lists, and sort them once with `relative(spaceDirectory, path).localeCompare(...)`. Treat a missing `cards/` directory as empty, but report a missing/unreadable input or `space.json` as `SpaceImportFileError('discovery', ...)`. Never recurse and never follow directory entries or symlinks as cards.

- [ ] **Step 4: Verify GREEN for discovery**

Run: `pnpm test test/unit/read-single-space.test.ts`

Expected: PASS for both input forms and ignored nested Markdown.

- [ ] **Step 5: RED — require complete parse diagnostics before returning**

Call the reader through a relative input path. Add a case with malformed `space.json`, one invalid-YAML card, and one missing-frontmatter card. Assert the thrown `SpaceImportFileError` has `kind: 'parsing'` and diagnostics naming all three absolute paths. Add a separate case where valid JSON contains a non-UUID edge endpoint and assert the absolute `space.json` path appears in the diagnostic.

- [ ] **Step 6: Verify RED for aggregate parsing**

Run: `pnpm test test/unit/read-single-space.test.ts`

Expected: FAIL because the minimal reader stops at the first parse error or does not aggregate path-bearing diagnostics.

- [ ] **Step 7: GREEN — parse every discovered byte before constructing `ImportSpace`**

Read the space file and all discovered card files before parsing. Parse JSON with an error diagnostic prefixed by the absolute space-file path; validate it with `importSpaceFileSchema`; run `parseImportCardFile` over every card; collect every diagnostic; throw once if any exist. On success split the file shape into the aggregate:

```ts
const { id, ...document } = parsedSpaceFile;
return importSpaceSchema.parse({
  ...(id === undefined ? {} : { id }),
  document,
  cards: parsedCards,
});
```

- [ ] **Step 8: Verify GREEN, refactor, and re-verify Task 2**

Run: `pnpm test test/unit/read-single-space.test.ts`

Expected: PASS with deterministic diagnostics and no warnings.

- [ ] **Step 9: Commit Task 2**

```bash
git add src/import/read-single-space.ts test/unit/read-single-space.test.ts
git commit -m "feat: discover one import space"
```

### Task 3: Transactional Import Identity Resolution

**Files:**
- Modify: `src/persistence/space-repository.ts`
- Modify: `src/persistence/postgres-space-repository.ts`
- Modify: `test/integration/postgres-space-repository.test.ts`

**Interfaces:**
- Consumes: `ImportSpace`, `importSpaceSchema`, `loadSpaceSnapshot`, Prisma callback transactions, and PostgreSQL `gen_random_uuid()`.
- Changes: `SpaceRepository.importSpaces(input: readonly ImportSpace[]): Promise<RepositoryImportResult>`.
- Preserves: `RepositoryImportResult = imported | conflict | rejected`, additive omission semantics, explicit-id optimistic updates, and cross-space ownership rejection.
- Produces privately: `resolveImport(input: ImportSpace, reservedSpaceId: UUID, allocate: () => Promise<UUID>): Promise<SpaceSnapshot>`.
- Produces privately: a prepared PostgreSQL UUID query returning `{ id: string }`, executed on the active transaction.
- Extends: import rejection codes to `'invalid-snapshot' | 'duplicate-identity' | 'card-ownership'`, so callers never classify failures by parsing message text.

- [ ] **Step 1: RED — change the public repository contract to accept id-optional input**

Add this compile-time contract assertion to the integration test:

```ts
expectTypeOf<Parameters<SpaceRepository['importSpaces']>[0]>().toEqualTypeOf<
  readonly ImportSpace[]
>();
```

- [ ] **Step 2: Verify RED for the repository contract**

Run: `pnpm typecheck`

Expected: FAIL because `SpaceRepository.importSpaces` still requires `readonly SpaceSnapshot[]`.

- [ ] **Step 3: GREEN — move import shape validation to the import boundary**

Change the interface parameter to `readonly ImportSpace[]`. In `PostgresSpaceRepository.importSpaces`, parse all inputs with `importSpaceSchema` and check duplicate explicit UUIDs before opening the transaction. Update `duplicateIdentity` to ignore absent ids while continuing to compare explicit space, card, route, and layout UUIDs globally.

Keep existing completely identified integration cases compiling because `SpaceSnapshot` is structurally assignable to `ImportSpace`.

- [ ] **Step 4: Verify GREEN for identified imports**

Run: `pnpm typecheck && pnpm test:integration:postgres -- postgres-space-repository`

Expected: PASS; existing completely identified imports remain valid `ImportSpace` values.

- [ ] **Step 5: RED — require PostgreSQL allocation for every missing identity**

Before adding the case, add cleanup that records every generated space as soon as an import returns:

```ts
const createdSpaceIds = new Set<UUID>();

const trackImported = (result: RepositoryImportResult): void => {
  if (result.kind !== 'imported') return;
  for (const stored of result.spaces) createdSpaceIds.add(stored.snapshot.id);
};

afterEach(async () => {
  for (const id of createdSpaceIds) {
    await db.orm.public.Card.where({ spaceId: id }).delete();
    await db.orm.public.Space.where({ id }).delete();
  }
  createdSpaceIds.clear();
  await db.orm.public.Card.where({ spaceId: SPACE_ID }).delete();
  await db.orm.public.Card.where({ spaceId: OTHER_SPACE_ID }).delete();
  await db.orm.public.Space.where({ id: SPACE_ID }).delete();
  await db.orm.public.Space.where({ id: OTHER_SPACE_ID }).delete();
  await db.orm.public.Space.where({ id: CONCURRENT_SPACE_ID }).delete();
});
```

Call `trackImported(result)` immediately after every import that may generate a space id, before assertions that could throw. Deleting the tracked owning space after its cards cleans every generated card; fixed explicit spaces and their cards remain covered by the existing cleanup statements.

Add a mixed input containing:

- no space id;
- two explicitly identified cards used by a route;
- one id-less, unreferenced card;
- one id-less route whose edge connects the explicit card UUIDs;
- one id-less layout whose position key is an explicit card UUID.

Assert the imported `StoredSpace` has UUIDs for the space, all three cards, the route, and the layout. Exactly four ids are generated—the space, id-less card, route, and layout—and those four must be distinct from one another and from both explicit card ids. Assert the route endpoints and layout position key remain the two explicit card UUIDs, then load the generated space id through the repository and assert the exact returned aggregate is durable.

In the same RED step, add an all-id-less, internally unreferenced fixture: no routes, one id-less card, and one id-less layout with empty positions. Import it twice, track both successful results for cleanup, and require the two stored spaces, cards, and layouts to have disjoint generated UUIDs. Separately import the mixed fixture twice: after the first succeeds, its two explicit cards belong to the first generated space, so require the second attempt to reject with a message naming the first conflicting card, leave the catalog unchanged from immediately before that attempt, and leave the first mixed aggregate unchanged.

- [ ] **Step 6: Verify RED for complete allocation**

Run: `pnpm test:integration:postgres -- postgres-space-repository`

Expected: FAIL because absent ids are not allocated.

- [ ] **Step 7: GREEN — allocate and resolve identities inside the callback transaction**

Prepare one query through the existing facade client:

```ts
const uuidAllocation = await database.prepare({}, (sql) =>
  sql.public.spaces
    .select('id', () => database.raw`gen_random_uuid()`.returns('pg/uuid@1'))
    .limit(1)
    .build(),
);
```

Inside `database.transaction(async (transaction) => ...)`, first reserve the target space row: create a new row with a minimal `{ version: 2, title, routes: [] }` document when the input has no id or when its explicit id is not stored; otherwise retain the current row and revision. The reserved row makes the prepared `SELECT ... FROM spaces LIMIT 1` return one row even in an empty database.

Define the active allocator as:

```ts
const allocate = async (): Promise<UUID> => {
  const row = await uuidAllocation.execute(transaction, {}).firstOrThrow();
  return uuidSchema.parse(row.id);
};
```

Resolve missing ids sequentially on the transaction connection without changing reference values:

```ts
const routes: SpaceSnapshot['document']['routes'][number][] = [];
for (const route of input.document.routes) {
  routes.push({ ...route, id: route.id ?? (await allocate()) });
}

const layouts: NonNullable<SpaceSnapshot['document']['layouts']> = [];
for (const layout of input.document.layouts ?? []) {
  layouts.push({ ...layout, id: layout.id ?? (await allocate()) });
}

const cards: SpaceSnapshot['cards'][number][] = [];
for (const card of input.cards) {
  cards.push({ ...card, id: card.id ?? (await allocate()) });
}

const snapshot: SpaceSnapshot = {
  id: input.id ?? reservedSpaceId,
  document: {
    ...input.document,
    routes,
    ...(input.document.layouts === undefined
      ? {}
      : { layouts }),
  },
  cards,
};
```

Use the reserved row's generated id for an id-less space instead of allocating a second space id. At this GREEN stage validate only the resolved public shape with `spaceSnapshotSchema`; the next RED adds normal domain validation. Update an existing explicit space document and revision optimistically; finish a new reserved row at revision `0n`. `create` generated-id cards and `upsert` explicit-id cards. Keep omitted stored cards untouched.

- [ ] **Step 8: Verify GREEN for allocation and additive import**

Run: `pnpm test:integration:postgres -- postgres-space-repository`

Expected: PASS for four-id mixed allocation, two successful all-id-less imports, mixed reimport ownership rejection, existing identified upsert, and additive omitted-card coverage.

- [ ] **Step 9: RED — reject UUID references that cannot name id-less entities**

Capture `catalogBefore = await repository.listSpaces()` and load any fixed explicit seed spaces used by the case. Import an id-less space containing an id-less card plus a route edge whose endpoint is a literal UUID not present on any explicitly identified card. Assert `{ kind: 'rejected', code: 'invalid-snapshot' }`, assert the message contains the unresolved UUID, assert `listSpaces()` still equals `catalogBefore`, and assert every known explicit seed row is unchanged. Do not try to load the rolled-back generated space or card by id: those ids are intentionally unavailable in the rejection result.

- [ ] **Step 10: Verify RED for post-allocation domain validation**

Run: `pnpm test:integration:postgres -- postgres-space-repository`

Expected: FAIL because the allocation GREEN validates only snapshot shape and accepts the dangling UUID.

- [ ] **Step 11: GREEN — turn domain rejection into full transaction rollback**

After `spaceSnapshotSchema` accepts the resolved shape, call `loadSpaceSnapshot(snapshot)`. Throw the existing private `SnapshotValidationError` from inside the transaction when normal domain intake returns errors. Catch it only outside the callback and return `invalid-snapshot`. Because reserved rows and allocated identities exist only inside the callback transaction, the thrown signal rolls all of them back.

- [ ] **Step 12: Verify GREEN for reference rejection**

Run: `pnpm test:integration:postgres -- postgres-space-repository`

Expected: PASS; the rejection names the unresolved UUID, preserves the exact prior catalog, and leaves every known explicit row unchanged.

- [ ] **Step 13: RED — distinguish duplicate identity and ownership rejection codes**

Change the duplicate explicit UUID assertion to require `{ kind: 'rejected', code: 'duplicate-identity' }`. Change the mixed reimport assertion to require `{ kind: 'rejected', code: 'card-ownership' }`. In the ownership batch, update a known explicit space before the conflicting mixed import and assert that known row remains byte-for-byte unchanged after rejection.

- [ ] **Step 14: Verify RED for typed import rejection codes**

Run: `pnpm test:integration:postgres -- postgres-space-repository`

Expected: FAIL because both identity failures are still returned as `invalid-snapshot`; the catalog and known-row rollback assertions already pass.

- [ ] **Step 15: GREEN — preserve typed rollback signals around the whole transaction**

Keep `CardOwnershipError`, `SnapshotValidationError`, and `ImportConflictError` as private thrown signals. Convert them to `RepositoryImportResult` only after the callback rejects: duplicate explicit ids use `duplicate-identity`, ownership uses `card-ownership`, and shape/reference/domain failures use `invalid-snapshot`. Do not return a rejection from inside the transaction, because returning would commit earlier writes.

- [ ] **Step 16: Verify GREEN, refactor, and re-verify Task 3**

Run: `pnpm test:integration:postgres -- postgres-space-repository`

Expected: PASS for explicit update, all-id-less repeated insertion, four-id mixed allocation, mixed reimport ownership rejection, invalid references, duplicate ids, and complete rollback.

- [ ] **Step 17: Commit Task 3**

```bash
git add src/persistence/space-repository.ts src/persistence/postgres-space-repository.ts test/integration/postgres-space-repository.test.ts
git commit -m "feat: allocate identities during import"
```

### Task 4: Shared Single-Space Import Orchestration

**Files:**
- Create: `src/import/import-single-space.ts`
- Create: `test/unit/import-single-space.test.ts`

**Interfaces:**
- Consumes: `readSingleSpace`, `SpaceRepository.importSpaces`, and `RepositoryImportResult`.
- Produces: `importSingleSpace(path: string, repository: SpaceRepository): Promise<StoredSpace>`.
- Throws: `SpaceImportFileError` for filesystem/parsing failures and `SingleSpaceImportError` with `kind: 'identity' | 'domain-validation' | 'revision-conflict'` for typed repository failures.

- [ ] **Step 1: RED — prove invalid files never reach the repository**

Create a recording `SpaceRepository` test double whose `importSpaces` stores received inputs and whose unrelated methods throw if called. Give `importSingleSpace` an invalid temporary directory, assert `SpaceImportFileError`, and assert its recorded import array remains empty. This assertion protects Hyper's parse-before-transaction boundary, not the test double's behavior.

- [ ] **Step 2: Verify RED for orchestration**

Run: `pnpm test test/unit/import-single-space.test.ts`

Expected: FAIL because `importSingleSpace` does not exist.

- [ ] **Step 3: GREEN — compose parse then repository import**

Implement the control flow exactly in this order:

```ts
const input = await readSingleSpace(path);
const result = await repository.importSpaces([input]);
if (result.kind === 'imported') {
  const [stored] = result.spaces;
  if (stored === undefined || result.spaces.length !== 1) {
    throw new Error(`Single-space import returned ${result.spaces.length} spaces`);
  }
  return stored;
}
```

Map `conflict` to `SingleSpaceImportError('revision-conflict', ...)`; map `duplicate-identity` and `card-ownership` to `identity`; map `invalid-snapshot` to `domain-validation`. Include the relevant UUID/message unchanged.

- [ ] **Step 4: Verify GREEN for parse-before-write and successful return**

Run: `pnpm test test/unit/import-single-space.test.ts`

Expected: PASS, including a valid directory case that asserts the returned `StoredSpace` is the repository's result.

- [ ] **Step 5: Refactor and re-verify Task 4**

Run: `pnpm test test/unit/import-single-space.test.ts test/unit/read-single-space.test.ts`

Expected: PASS with no warnings.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/import/import-single-space.ts test/unit/import-single-space.test.ts
git commit -m "feat: compose single-space import"
```

### Task 5: CLI Command and Imported-Space Reporting

**Files:**
- Create: `src/cli/run.ts`
- Create: `src/cli/main.ts`
- Create: `src/cli/entry.ts`
- Create: `test/unit/hyper-cli.test.ts`
- Create: `test/integration/hyper-cli.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `importSingleSpace`, `PostgresSpaceRepository`, and `db`.
- Produces: `interface CliIo { stdout(message: string): void; stderr(message: string): void }`.
- Produces: `runHyper(args: readonly string[], dependencies: { repository: SpaceRepository; io: CliIo }): Promise<number>`.
- Produces: `runCliMain(args: readonly string[], dependencies: { repository: SpaceRepository; io: CliIo; close(): Promise<void> }): Promise<number>`.
- Produces command: `pnpm hyper -- <space.json-or-directory>`.
- Reports success exactly as `Imported space <uuid> at revision <bigint>\n`.

- [ ] **Step 1: RED — specify CLI argument and outcome mapping**

In `test/unit/hyper-cli.test.ts`, call `runHyper` directly with captured stdout/stderr functions. Cover these literal outcomes:

- no path: exit `2`, stderr `Usage: hyper <space.json-or-directory>\n`;
- two paths: exit `2`, the same usage text;
- successful stored space: exit `0`, stdout `Imported space <SPACE_ID> at revision 0\n`;
- `SpaceImportFileError`: exit `1`, stderr containing every path diagnostic;
- identity/domain/conflict errors: exit `1`, stderr containing their entity UUID;
- unexpected database error: exit `1`, stderr `Database import failed: connection lost\n`.

- [ ] **Step 2: Verify RED for CLI behavior**

Run: `pnpm test test/unit/hyper-cli.test.ts`

Expected: FAIL because `runHyper` does not exist.

- [ ] **Step 3: GREEN — implement the pure CLI runner**

Implement `runHyper` without reading `process.argv` or exiting the process. It validates exactly one positional argument, awaits `importSingleSpace`, writes one message, and returns the exit code. Format bigint revisions with `stored.revision.toString()`.

- [ ] **Step 4: Verify GREEN for CLI mapping**

Run: `pnpm test test/unit/hyper-cli.test.ts`

Expected: PASS with exact output and no warnings.

- [ ] **Step 5: RED — classify database shutdown failure**

In `test/unit/hyper-cli.test.ts`, call `runCliMain` with a successful repository and `close: () => Promise.reject(new Error('socket stuck'))`. Assert exit `1`, stderr exactly `Database shutdown failed: socket stuck\n`, and no stack trace. Add a success case whose `close` resolves and assert it preserves `runHyper`'s exit code and output.

- [ ] **Step 6: Verify RED for shutdown classification**

Run: `pnpm test test/unit/hyper-cli.test.ts`

Expected: FAIL because `runCliMain` does not exist.

- [ ] **Step 7: GREEN — classify close failure inside the testable main function**

Implement `src/cli/main.ts`:

```ts
export const runCliMain = async (
  args: readonly string[],
  dependencies: {
    repository: SpaceRepository;
    io: CliIo;
    close(): Promise<void>;
  },
): Promise<number> => {
  const exitCode = await runHyper(args, dependencies);
  try {
    await dependencies.close();
    return exitCode;
  } catch (error) {
    dependencies.io.stderr(`Database shutdown failed: ${describeError(error)}\n`);
    return 1;
  }
};
```

Keep `describeError(error)` private and return `error.message` for `Error`, otherwise `String(error)`.

- [ ] **Step 8: Verify GREEN for shutdown classification**

Run: `pnpm test test/unit/hyper-cli.test.ts`

Expected: PASS; close failures are rendered as one classified line and never escape as an unhandled stack trace.

- [ ] **Step 9: RED — spawn the real command against PostgreSQL**

In `test/integration/hyper-cli.test.ts`, create a temporary valid space directory with an explicit space UUID and one id-less Markdown card. Register that explicit owning space id in the test's cleanup set before spawning; `afterEach` deletes cards by `spaceId`, deletes the space, and removes the temporary directory, so the generated card cannot leak if a later assertion fails. Spawn `pnpm hyper -- <directory>` with the test's inherited `DATABASE_URL`. Assert status `0`, exact success output containing the explicit space UUID, then use `PostgresSpaceRepository.loadSpace` to assert the card has a generated UUID and the returned document/body is durable. Add a malformed-card case asserting non-zero status, the absolute card path on stderr, and no stored space.

- [ ] **Step 10: Verify RED for the executable command**

Run: `pnpm test:integration:postgres -- hyper-cli`

Expected: FAIL because there is no `hyper` script or main module.

- [ ] **Step 11: GREEN — add the runtime entry and pinned runner**

Run:

```bash
pnpm add --save-dev tsx@4.20.6
```

Add to `package.json` scripts:

```json
"hyper": "tsx src/cli/entry.ts"
```

Implement `src/cli/entry.ts`:

```ts
import { runCliMain } from './main';
import { PostgresSpaceRepository } from '../persistence/postgres-space-repository';
import { db } from '../prisma/db';

const io = {
  stdout: (message: string) => process.stdout.write(message),
  stderr: (message: string) => process.stderr.write(message),
};

process.exitCode = await runCliMain(process.argv.slice(2), {
  repository: new PostgresSpaceRepository(db),
  io,
  close: () => db.close(),
});
```

- [ ] **Step 12: Verify GREEN for the real command**

Run: `pnpm test:integration:postgres -- hyper-cli`

Expected: PASS for success durability and parse-failure rollback/reporting.

- [ ] **Step 13: Refactor and re-verify Task 5**

Run: `pnpm test test/unit/hyper-cli.test.ts test/unit/import-single-space.test.ts && pnpm test:integration:postgres -- hyper-cli`

Expected: PASS with clean stdout/stderr.

- [ ] **Step 14: Commit Task 5**

```bash
git add src/cli/run.ts src/cli/main.ts src/cli/entry.ts test/unit/hyper-cli.test.ts test/integration/hyper-cli.test.ts package.json pnpm-lock.yaml
git commit -m "feat: import one space from the CLI"
```

### Task 6: Verification and Issue Closure

**Files:**
- Modify: `.scratch/database-persistence/issues/05-single-space-cli-import.md`

**Interfaces:**
- Consumes: all Task 1–5 behavior and verification output.
- Produces: a resolved issue with an `## Answer` that states the importer returns/reports `StoredSpace`, UUID references require explicit targets, and issue 07 owns opening/selection.

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
pnpm test packages/core/test/persistence-schema.test.ts packages/graph/test/card-file.test.ts test/unit/read-single-space.test.ts test/unit/import-single-space.test.ts test/unit/hyper-cli.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the complete PostgreSQL integration suite**

Run: `pnpm test:integration:postgres`

Expected: PASS, including repository and spawned CLI import tests.

- [ ] **Step 3: Run repository-wide verification**

Run: `pnpm verify`

Expected: PASS for root typecheck, per-package typecheck, lint with zero warnings, formatting, and coverage tests.

- [ ] **Step 4: Inspect whitespace and scope**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only issue-05 import code, tests, dependency metadata, the approved spec correction, this plan, and issue 05 documentation in the diff.

- [ ] **Step 5: Mark issue 05 resolved with evidence**

Change `**Status:** ready-for-agent` to `**Status:** resolved`, check every acceptance box, and add an `## Answer` naming the real focused, integration, and `pnpm verify` results. State that no import-local reference language exists and that CLI success reports the imported aggregate/id without opening a browser workspace.

- [ ] **Step 6: Commit Task 6**

```bash
git add .scratch/database-persistence/issues/05-single-space-cli-import.md
git commit -m "docs: resolve single-space CLI import"
```
