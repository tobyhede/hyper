# Hyper

Hyper is for technical talks and designs whose ideas connect as a graph rather than a single line. You write **Resources** (Markdown, pictures, or whole nested Spaces), place them on a **Map**, and connect them with **Graphs**: named, coloured, directed paths through the same Resources. [React Flow](https://reactflow.dev) draws every Graph at once, each in its own colour, at the positions you chose.

**Presenting is traversing a Graph on its own Stage** ([ADR 0024](docs/adr/0024-presenting-is-traversing-a-route.md)). Present takes the browser fullscreen where it can and draws the Graph's first Resource on a full-window Stage, one 16:9 frame letterboxed over the canvas, which stays behind it untouched ([ADR 0123](docs/adr/0123-presenting-draws-on-its-own-stage-not-on-the-canvas.md)). Arrow keys follow the Graph's Edges: Right follows the selected one, Left goes back along the path taken, Up and Down choose at a fork. Leaving presenting shows the canvas exactly as it was.

Your work is a directory of plain files, an [Aggregate directory](docs/aggregate-directory.md), that you keep in its own git repository.

## Quick start

You need Node ≥ 26.8.1 and pnpm 9.

```sh
git clone https://github.com/tobyhede/hyper.git
cd hyper
pnpm install
pnpm hyper init ~/talks/rust-async
pnpm hyper run ~/talks/rust-async
```

`init` writes a new aggregate to `~/talks/rust-async`, which must be missing or empty, and prints the command that runs it. `run` prints the address it serves (`http://localhost:4173/` unless that port is taken) and opens it in your browser.

1. Edit. Pick a Graph in the Command Dock, the toolbar floating over the canvas; every Graph stays drawn, and the one you pick is emphasised. Select a Resource to reveal its toolbar, and use Edit to write its Title and Markdown. Drag a Resource to move it. Drag from one of a Resource's four handles to another Resource to add an Edge to the active Graph; hold Option (macOS) or Alt and drop on empty canvas to create a new Resource and connect it in one go.
2. Press **Present** to traverse the Graph: `→` follows an Edge, `←` goes back, `↑` / `↓` choose at a fork, `Esc` returns to the Map.
3. Press Ctrl-C in the terminal. Hyper writes anything not yet on disk and exits.
4. Commit your work in the directory's own repository:

   ```sh
   cd ~/talks/rust-async
   git init        # the first time only
   git add -A
   git commit -m "First draft"
   ```

Run `pnpm hyper run` from the Hyper clone every time, pointing at whichever directory you are working on. For every `pnpm hyper` verb, a relative path is relative to where you ran pnpm.

## How Running works

`pnpm hyper run <dir>` **runs** an Aggregate directory ([ADR 0117](docs/adr/0117-running-serves-an-aggregate-directory-as-the-durable-copy.md)). Hyper reads the directory into memory, serves it, and writes it back as you edit. While it runs, **the directory is your work**; nothing else is kept.

- **Your content lives in its own git repository**, at any path you like. Hyper does not need it to be inside the Hyper clone, and nothing of yours belongs there.
- **Hyper writes the directory on every edit.** Once your edits have been quiet for about a second, Hyper writes the directory, so `git status` shows what you changed. Stopping Hyper writes anything still pending. Ctrl-C, closing the terminal (SIGHUP) and SIGTERM all stop it the same way; a second Ctrl-C exits at once without waiting.
- **Git is your undo.** Hyper keeps no history of its own and does not lock the directory or watch it for changes. The last write wins. To undo an edit, check out the earlier file. If you `git pull` while Hyper is running, or run Hyper twice on one directory, Hyper's next write replaces what is on disk with what it holds, and you recover the other version with git. Pull and edit files with Hyper stopped.
- **An edit is lost if Hyper exits without writing it.** If Hyper is killed outright (`kill -9`, a power cut) within that quiet second, or a second Ctrl-C exits it without waiting, the edits not yet written are lost. A write can also fail, for example when the disk is full or a path is a symbolic link, which Hyper refuses to write through. While Hyper runs, it prints `Could not write the directory:` with the reason and tries again a second later. If the write made on stopping fails, Hyper prints `Stopped, but the last edits were not written:` with the reason and exits with status 1, and the edits it could not write are lost. A stop that wrote everything ends with `Stopped; <dir> holds every edit.`; check for that line before treating the directory as complete.
- **Hyper writes only its own files, in place.** It writes `hyper.json`, the Space directories' `space.json` and Resource files, and `images/`, changing only the files whose content changed. Anything else in the directory, such as `.git`, a README or a `notes/` directory, is left alone, and the directory itself is never moved or recreated. A crash in the middle of a write can leave some files new and some old; git restores them.
- **A `*.md` file beside `space.json` is removed by the next write.** Hyper reads every Markdown file in a Space's directory and its `resources/` directory as a Resource, and rewrites them all. Keep your own notes elsewhere, for example in a `notes/` directory: other files and directories are left alone.
- **Pictures are written to `images/`.** A picture you upload is written to the directory's `images/`, named by its content, so committing the directory commits the picture. A picture linked by `https:` URL stays a link.
- **Starting.** `run` serves an existing Aggregate directory only. A missing or empty directory is refused, naming the `pnpm hyper init` command that creates one there, so a mistyped path never becomes a new aggregate. Dot-entries such as `.git` and `.DS_Store` do not count, so `git init` before `init` is fine. A directory that is not a valid Aggregate directory is refused, with its problems printed, and nothing is served; fix the files and start again. A run with no edits leaves the directory byte-for-byte as it was.
- **Ports and the browser.** Hyper serves on port 4173, or the next free port if that one is taken. `--port <port>` picks the port and fails if it is taken. `--no-open` leaves the browser alone, for running Hyper headless or from an agent:

  ```sh
  pnpm hyper run ~/talks/rust-async --port 4200 --no-open
  ```

The file format, including what Hyper keeps and removes when it writes, is described in [`docs/aggregate-directory.md`](docs/aggregate-directory.md).

## Using Hyper with agents

This repository carries two agent skills, in [`.agents/skills/`](.agents/skills/) and linked from `.claude/skills/`:

- **`hyper-getting-started`**: sets a person up from a fresh clone: checks Node and pnpm, installs, chooses or creates the content directory as its own git repository, and starts a run.
- **`hyper-authoring`**: writes or changes an Aggregate directory as files: Spaces, Resources, Maps, Graphs, Edges and pictures. It stops the run first, because Hyper's next write would replace edits made underneath it.

## Developing Hyper

Read [`AGENTS.md`](AGENTS.md) before changing code. It is written for coding agents and is the authority on commands, package boundaries, conventions and what "done" means here; this section is the human summary.

### Development servers

Requirements: Node ≥ 26.8.1 and pnpm 9. Local PostgreSQL also requires Docker Engine or Docker Desktop with Compose v2.

```sh
pnpm install
pnpm dev             # PostgreSQL-backed app at http://localhost:5173 (needs the database up)
pnpm dev:new         # fresh one-resource memory space at http://localhost:5174
pnpm dev:fixture     # tracked test fixture in memory at http://localhost:5175
```

A completed edit is committed automatically through the persistence session; the persistence indicator reports `Saving changes` and then `Persisted`. Under `pnpm dev` the edit lands in PostgreSQL and outlives the page; under `pnpm dev:new` and `pnpm dev:fixture` it lives in that server's memory repository, surviving browser reloads but not a restart. Under `pnpm hyper run` it is written to the directory being run.

The Space, a Map, a Resource, a Graph and each Active Resource reached while Presenting have durable URLs built from their UUIDs ([ADR 0069](docs/adr/0069-entities-have-durable-web-addresses.md)). The Command Dock and the presenting chrome offer **Copy link** for the current one, browser Back and Forward follow the entries, and a pasted link reopens the same place. Resolving a URL is navigation, never authoring.

A Resource declares one handle on each of its four sides, source and target alike, and an Edge attaches to the anchor facing the Resource at its other end. It is chosen while the Edge is drawn, so the attachment follows a drag ([ADR 0087](docs/adr/0087-an-edge-attaches-to-the-anchor-that-faces-its-neighbour.md)). Several Graphs through one pair of Resources therefore draw between the same two points, told apart by colour.

### Verify

```sh
pnpm verify         # typecheck + lint + prettier check + unit/property tests
pnpm e2e            # Playwright flow (each test boots its own isolated server)
pnpm e2e:fixture    # only scenarios backed by the tracked fixture
```

Both Playwright commands create and dispose an isolated server per test automatically. They differ in what those servers hold: `pnpm e2e:fixture` runs only the tracked-fixture project, while `pnpm e2e` also runs `new-space`, whose servers start from an empty catalog so startup mints the one-resource new space. They need the Chromium browser once: `pnpm exec playwright install chromium`.

### Local PostgreSQL

Local PostgreSQL is opt-in; `pnpm verify` and `pnpm e2e` do not require it.
Copy the credential-free template:

```sh
cp .env.example .env
```

In `.env`, choose a URL-safe password and use it in both blank values:

```dotenv
POSTGRES_PASSWORD=<your-local-password>
DATABASE_URL=postgresql://hyper:<your-local-password>@127.0.0.1:55432/hyper
```

Then start PostgreSQL 17.5, run the real database test, and stop the container:

```sh
pnpm postgres:up
pnpm test:integration:postgres
pnpm postgres:down
```

The integration command emits the Prisma Next contract, applies pending
migrations, and performs a typed space/resource JSONB write and read. To run only
the schema steps:

```sh
pnpm contract:emit
pnpm db:migrate
```

Compose and Hyper's Prisma config/runtime read the same ignored `.env`;
deployed environments should inject `DATABASE_URL` through their secret
manager. `pnpm postgres:down` keeps the named data volume. To delete local
database state, run the destructive reset `docker compose down --volumes`.

### Local SQLite

SQLite is an opt-in development host beside PostgreSQL, not a replacement for it:

```sh
pnpm dev:sqlite                                   # app at http://localhost:5177, file at .scratch/sqlite/hyper.db
SQLITE_PATH=/absolute/path/hyper.db pnpm test:integration:sqlite
```

`SQLITE_PATH` names the file for the host and the CLI. The integration suite needs it set but does not test against it: `pnpm test:integration:sqlite` runs `pnpm db:migrate:sqlite` first, which fails with `PN-CLI-4005` when the variable is absent because `prisma-next.config.sqlite.ts` then declares no `db.connection`, while the cases themselves each mint and remove a fresh temp file through `openSqliteRepository`. So the value the suite is given is migrated and then left alone.

Use a stable absolute path in a local directory the application owns. The host and CLI both refuse to start when `SQLITE_PATH` is unset or blank, or when its parent directory is missing or not writable, and the CLI also refuses a file that does not exist, since SQLite would otherwise create an empty unmigrated one and fail on a missing table. **A relative value is refused by the host and by the CLI.** `pnpm db:migrate:sqlite` runs from the repository root while the host runs from `packages/app`, so a relative value would migrate one file and open another: `pnpm dev:sqlite` refuses one before migrating, so nothing under the repository root is touched, and the host checks again at composition, so a relative path reaching it by another route is still refused. `pnpm hyper import --store sqlite` and `pnpm hyper export --store sqlite` refuse one too, with `SQLITE_PATH must be an absolute path`. A network filesystem, a file shared between hosts and a hosted SQLite service are not supported deployments.

**One Hyper process per file.** Inside that process every repository operation is serialised, so overlapping Edits answer as they would on PostgreSQL: a stale revision is a conflict, and nothing waits on SQLite. A second process on the same live file — `pnpm hyper import --store sqlite` against a file `pnpm dev:sqlite` holds, or two hosts — is unsupported. SQLite locks the whole file, so when the two meet, an operation either fails at once, waits out the driver's fixed 5 second busy timeout and then fails, or waits and succeeds if the other process's lock clears before that timeout. A second process that is only reading is enough: a commit here cannot finish while that read's transaction is open. The wait is synchronous, so the host answers nothing else for those seconds. A failure either way answers `503 persistence-unavailable`, which the browser retries, never a `409`, and no partial write or stuck lock is left behind (`test/integration/sqlite-contention.test.ts`).

The file uses SQLite's default rollback journal (`journal_mode=delete`) with `synchronous=FULL`; WAL is not enabled. To back it up, stop the host (or anything else writing the file) and copy the file, or use SQLite's own backup API (`sqlite3 hyper.db ".backup copy.db"`). Do not copy the file while a writer has it open: a copy taken mid-transaction need not be a consistent database.

### Importing and Exporting a database

The `hyper` CLI moves a complete [Aggregate directory](docs/aggregate-directory.md) in and out of a database. The unit is always the whole aggregate, every Space rooted at the Meta Space, never one Space chosen from among them.

```sh
pnpm hyper export ./my-aggregate                       # write the complete stored aggregate
pnpm hyper import ./my-aggregate                       # initialize an empty repository from it
pnpm hyper import ./my-aggregate --dangerous-replace   # replace the stored aggregate outright
```

Both verbs reach PostgreSQL unless `--store sqlite` names SQLite. Two doors and no mode parameter on either. Without the flag, an already-initialized repository is left exactly as it is and the command says so; with it, whatever is stored — a valid aggregate or state the repository refuses to read — is replaced atomically, authorized by the Meta identity the repository just reported ([ADR 0094](docs/adr/0094-dangerous-truncate-replaces-whatever-is-stored.md)). There is no merge mode.

The flag is **permission to destroy rather than a demand that something be destroyed**: given an empty repository there is nothing to replace, so it takes the initializing door instead and the result is an ordinary first import. Should something else establish a Meta Space in the gap — `pnpm dev`'s startup, a concurrent `hyper` — that is reported as a conflict saying nothing was written and to run the command again, rather than advising the flag the operator has just passed.

Initializing a database is not a command: a host establishes a new Space in an empty database at start-up ([ADR 0124](docs/adr/0124-one-hyper-cli.md)). So a database a host has already started on holds an aggregate, and importing into it needs `--dangerous-replace`.

Export writes the destination in place, exactly as a run does ([ADR 0119](docs/adr/0119-export-writes-in-place-and-git-answers-for-a-partial-write.md)): only the files Import reads, and nothing else in the directory. It records the revision it projected for each Space, and writes and Import admits the pictures in `images/` on every store ([ADR 0118](docs/adr/0118-an-aggregate-directory-carries-stored-image-bytes.md)).

The same commands run against a SQLite file with `--store sqlite`, which requires `SQLITE_PATH` to name an already-migrated file (`pnpm db:migrate:sqlite`). The flag, not the environment's contents, picks the database, so a command without it stays PostgreSQL even when `.env` names both. Run it only against a file no host has open — stop `pnpm dev:sqlite` first, or point it at a different file. An exported directory is the only way to move an aggregate between the two databases:

```sh
pnpm hyper export ./my-aggregate                               # from PostgreSQL
SQLITE_PATH=/absolute/path/hyper.db pnpm hyper import ./my-aggregate --store sqlite   # into an empty SQLite file
```

### Architecture

A pnpm workspace with strict TypeScript and enforced package boundaries:

| Package | Responsibility |
| --- | --- |
| `@project/core` | Domain types + Zod schema. No framework code. |
| `@project/graph` | Pure graph logic: intake and indexing, lookups, Graph navigation, referential validation, Graph→Edge derivation, and the `LayoutStrategy` contract. Property-tested. |
| `@project/persistence` | Browser-safe backend and session contracts, optimistic revisions, commit coalescing, failure/conflict handling, and the memory adapter. |
| `@project/http` | The browser-safe Fetch transport: the Hono `/api` route tree and its request and response policy. |
| `@project/react-flow-adapter` | Owns React Flow projection and every React Flow specific. Projects the domain model, already laid out, into coloured React Flow Resource nodes and Edges. It implements no `LayoutStrategy` and applies none — `@project/app` does that. |
| `@project/ui` | Reusable, framework-agnostic React: the Resource renderer, the Command Dock's surfaces, presentation controls, the app shell. |
| `@project/app` | Wiring: Navigation, Space Authoring and Edge Authoring, product-URL navigation over the browser History API (no router library), the Zustand-backed render adapter, the canvas, the presenting Stage, and Vite. |

Design rules kept throughout: domain logic stays out of React components, React Flow specifics stay in the adapter, and app wiring stays in `@project/app`.

**Graphs as colour-coded flows.** Each authored Edge becomes a coloured drawn Edge. Every Resource carries four Edge anchors, one on each side, and an Edge attaches to whichever anchor faces the other Resource — decided while the Edge is drawn, from where the two Resources are at that moment, so the attachment follows a drag (ADR 0087). `@project/graph` derives the Edges (`buildGraphRenderEdges`) and assembles the graph to arrange (`buildLayoutStrategyGraph`); `@project/react-flow-adapter` applies a `LayoutStrategy`, colours the projection (`projectResourceNodes`, `projectGraphEdges`) and chooses each Edge's two anchors (`edge-attachment.ts`). Switching Graphs changes emphasis, not visibility or placement.

**Maps and layout strategies.** A **Map** is authored data: a named Resource-to-position mapping stored with the Space. A **LayoutStrategy** is behaviour: it takes the layout-strategy graph to arrange and asynchronously returns that same value with positions on its Resources ([ADR 0014](docs/adr/0014-layout-is-the-authored-data-strategy-is-the-behaviour.md)):

```ts
type LayoutStrategy = (graph: LayoutStrategyGraph) => Promise<LayoutStrategyGraph>;
```

Two ship, both in `@project/graph`. `gridStrategy` is a pure automatic strategy that places Resources on a grid, and nothing selects it today. `positionedStrategy` reads an authored Map, and it is what the canvas draws. An automatic layout returns as a destructive Edit over a Map rather than as a render path ([ADR 0086](docs/adr/0086-automatic-arrangement-is-an-edit-not-a-render-path.md)). Where an Edge attaches is the render layer's own question. Which Resources a strategy arranges is the view's choice, not the strategy's.

**Resources.** The graph draws a Closed Resource's **Title**, not its content. Opening a Resource grows it in place and shows its content ([ADR 0064](docs/adr/0064-opening-a-card-expands-it-in-place.md)); editing its source is a separate action. The same Markdown renderer draws the Active Resource on the Stage while Presenting. A Resource occupies exactly one position in a Map; showing the same content at a second position is the job of a Reference Resource ([ADR 0004](docs/adr/0004-cards-are-the-graph.md)).

**The browser never touches files.** It lists, opens and commits Spaces over HTTP and nothing else. Reading and writing an Aggregate directory is server-side: the `hyper` CLI's `init`, `run`, `import` and `export`.

### Tests

- Schema validation and rejection cases (`@project/core`).
- Unresolved Resource, Edge and Graph references and duplicate ids (`@project/graph`).
- Graph navigation behaviour, with fast-check property tests for clamping/monotonicity and validation invariants.
- React Flow projection correctness (`@project/react-flow-adapter`).
- Aggregate directory round trips, Export and Import, and a `pnpm hyper run` that edits over HTTP and stops on SIGINT (`test/unit`, `test/integration`).
- Playwright flows: app loads, the graph is visible, a Graph is selected, Resources open, a completed drag reaches the backend and survives a reload, a drawn connection mints and activates a Graph, and a Graph is traversed on the Stage.

### Current limitations

- **No undo inside the application.** Under `pnpm hyper run`, git is the undo.
- **Overlay legibility.** The graph draws every Graph at once, at the positions the Map authored. An Edge runs backward whenever the author placed its target left of its source — which two Graphs disagreeing about the order of Resources they share will force on one of them — and nothing routes an Edge around a Resource: every Edge is the bezier React Flow draws, so a backward one curls back on itself. See [`.scratch/multiple-routes/findings.md`](.scratch/multiple-routes/findings.md).
- **Closed Resources are a fixed shape.** A Closed Resource draws its Title, so every Closed Resource is the same size — declared once in `packages/app/src/resource.ts` as a 16:9 ratio and consumed by both the layout and the stylesheet. Content adapts to the Resource, not the reverse, which is why a measured DOM size never decides placement.
- **No speaker view, timer, transitions or export to another presentation format.** They return, if wanted, as their own decisions designed against a traversal ([ADR 0024](docs/adr/0024-presenting-is-traversing-a-route.md)).
- The production bundle ships React Flow in a single chunk — fine for a prototype, not tuned for size. Remeasured after elkjs left: the entry chunk is ~1.2 MB (381 kB gzipped) beside ~106 kB of CSS, and `MarkdownSourceEditor` is split out as a further ~623 kB fetched on first edit.
