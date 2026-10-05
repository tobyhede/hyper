# Running an Aggregate directory

Status: ready-for-agent

## Problem Statement

Hyper is only usable by someone willing to run a database. The default `pnpm dev` needs PostgreSQL up and migrated; SQLite needs an absolute `SQLITE_PATH`, a migration and the CLI to get content in and out; the memory hosts lose every edit on restart. An author who wants to keep a talk or a design in a git repository has to Import it into a database, edit, remember to run `hyper export`, and commit — and any picture they uploaded never reaches the directory at all, because Export carries an Image Resource's URL and not its bytes.

There is also no front door. The README opens with pnpm, Docker and port numbers for contributors; nothing tells a newcomer "clone this, point it at a folder", and an agent helping a human has no skill that says how to start Hyper or how the on-disk format works.

## Solution

**Running**: `pnpm start <dir>` from a clone of this repository serves an Aggregate directory directly. It Imports the directory into a fresh in-memory store, serves the application, Exports back to the directory after every committed edit (debounced) and once more when stopped, and discards the store. The directory is expected to live in its own git repository, and git answers for history, undo and concurrent writers — the last write wins. A missing or empty directory becomes the new Space and is written there.

Export carries the bytes of every referenced stored image in an `images/` directory, and Import admits them, so a picture uploaded during a run survives it, on every store.

A clone-first README and two agent skills — one to get a human started, one to author an Aggregate directory — make the front door.

## User Stories

1. As an author, I want to run `pnpm start ~/talks/rust-async`, so that I can work on a talk without setting up a database.
2. As an author, I want my edits written into the directory while I work, so that `git status` shows what I changed without a separate export step.
3. As an author, I want pressing Ctrl-C to write any edit not yet on disk before Hyper exits, so that quitting never loses the last thing I did.
4. As an author, I want a second Ctrl-C to exit immediately, so that a stuck write cannot trap me in the terminal.
5. As an author, I want SIGTERM and SIGHUP (closing the terminal tab) to flush the same way as Ctrl-C, so that the way I stop Hyper does not decide whether my work is saved.
6. As an author, I want `pnpm start ./new-talk` on a directory that does not exist to create a new Space there, so that starting a talk is one command.
7. As an author, I want an empty directory treated the same as a missing one, so that `mkdir` then `pnpm start` works.
8. As an author, I want an invalid Aggregate directory refused with the intake's errors printed, so that I can fix the files rather than have Hyper guess.
9. As an author, I want a directory holding a single Space without `hyper.json` refused with a message naming what is missing, so that I am not confused by a half-format.
10. As an author, I want the exported directory to be byte-for-byte unchanged when I run and quit without editing, so that a run never dirties git on its own.
11. As an author, I want deterministic output when I do edit, so that my diffs show only what I changed.
12. As an author, I want a picture I upload during a run written into the directory, so that committing the directory commits the picture.
13. As an author, I want pictures named by their content, so that the same picture is stored once and never churns in git.
14. As an author, I want a run started on a directory with pictures to serve them, so that cloning my talk elsewhere shows the same images.
15. As an author, I want an external image URL left as a URL, so that Hyper does not download things I linked to.
16. As an author, I want a stored image whose bytes are missing exported as its URL rather than failing the whole write, so that one missing picture does not stop my edits reaching disk.
17. As an author, I want the URL Hyper serves printed on start, so that I know where to go.
18. As an author, I want my browser opened on start, so that there is nothing to copy.
19. As an author, I want `--no-open`, so that I can run Hyper headless or from an agent.
20. As an author, I want Hyper to use port 4173 and fall back to the next free port, so that it does not collide with a contributor's dev servers or a second run.
21. As an author, I want `--port`, so that I can choose the port.
22. As an author, I want to be told that git is my undo, so that I know a bad edit, a pull mid-run or two runs on one directory are recovered with git rather than by Hyper.
23. As an author, I want the README to warn that a Markdown file beside `space.json` is removed by Export, so that I do not keep my own notes there.
24. As an author, I want the accepted loss window (a crash before the debounced write) documented, so that I know the one way an edit can be lost.
25. As an author, I want `pnpm hyper export` from SQLite or PostgreSQL to carry pictures too, so that the directory format is the same whichever store wrote it.
26. As an author, I want Importing a directory with pictures into SQLite or PostgreSQL to store them, so that I can move an aggregate between stores with its pictures.
27. As a newcomer, I want the README's first section to be clone, install, start, so that I can see Hyper working in minutes.
28. As a newcomer, I want the reference for the directory format in its own document, so that the README stays short.
29. As a contributor, I want the database and dev-server instructions kept under "Developing Hyper", so that nothing I rely on is lost.
30. As an agent helping a human, I want a `hyper-getting-started` skill, so that I can set up the clone, install and start a run without reading the whole repository.
31. As an agent authoring content, I want a `hyper-authoring` skill describing the Aggregate directory, so that I can write Spaces, Resources, Maps, Graphs and Edges as files correctly.
32. As an agent authoring content, I want to be told to stop the run before editing files, so that a write-through does not overwrite my edits.
33. As an agent, I want the skills discoverable from both `.agents/skills/` and `.claude/skills/`, so that both harnesses find them.
34. As a maintainer, I want the memory repository to be production code that passes the shared repository contract, so that Running stands on a tested store rather than test support.
35. As a maintainer, I want Running and image bytes recorded as ADRs, so that a future reader knows why the directory became the durable copy and why ADR 0106 was amended.

## Implementation Decisions

- **Running is a domain term** (now in `CONTEXT.md`), and the Exporting entry says Exporting makes an edit durable only while Running. "Hyper" stays the product name; a rename is a separate change.
- **ADR 0117 — Running.** The directory is the durable copy and the store is ephemeral; write-through after each committed edit plus a final flush on signal; git is assumed and answers for history, undo and concurrent writers, so there is no fingerprinting, no lock and no conflict detection; the loss window is a crash before a debounced write and is accepted for a single-user product.
- **ADR 0118 — An Aggregate directory carries stored image bytes.** Amends ADR 0106: Export writes each stored image the aggregate references to `images/<content-id>.<ext>`; Import admits them before the aggregate is stored. External URLs, and stored URLs whose bytes are missing, are exported as URLs only. It applies to every store, so there is one directory format. Because what Exporting removes is exactly what Importing scans, Export rewrites `images/` whole, so a picture no Resource references any more leaves the directory. Images stay outside the aggregate's revision — writing them is part of Exporting, not of a commit.
- **The memory `SpaceRepository` moves from test support into production source** unchanged in behaviour; the E2E memory runtime, the fixture importer and the repository contract test import it from there.
- **The Run module is the one new seam.** One operation starts a run on a directory and answers the served host and a stop operation. It Imports the directory into a fresh memory repository (or establishes the new Space when the directory is missing or empty, and writes it immediately), observes committed edits, and Exports after a quiet period. Every Export writes the directory in place (ADR 0119): only the files Import reads, with no staging, backup or whole-write atomicity; git answers for a partial write. Stop flushes any pending write and waits for it. The clock (and therefore the debounce) is injected at composition (ADR 0109).
- **Writes are serialised**: an edit committed during a write schedules one more write after it, never a concurrent one.
- **The launcher** is a thin script behind `pnpm start <dir>` that starts Vite programmatically with the Run module as its HTTP runtime, picks the port (4173, next free, `--port`), prints the URL, opens the browser unless `--no-open`, and owns SIGINT/SIGTERM/SIGHUP: the first signal stops the run (flushing) and closes the server, a second forces exit.
- **Exit codes** follow the CLI: refused directory or usage error is non-zero with the intake errors printed; a clean stop is zero.
- **The fixture's separate image directory collapses** into the fixture's own `images/`, and the fixture importer uses the normal Import path for images.
- **The README is clone-first**: what Hyper is, quick start, how Running works, using Hyper with agents, Developing Hyper. The format reference moves to `docs/aggregate-directory.md`.
- **Two skills** in `.agents/skills/` with `.claude/skills/` symlinks: `hyper-getting-started` and `hyper-authoring`.

## Testing Decisions

- Tests assert external behaviour — what is on disk, what the HTTP app answers, the exit code — never the debounce's internals or which functions were called.
- **Export and Import** (existing seam): image bytes are tested where the aggregate round trip, Export and Import are already tested, against a repository in the node environment. Prior art: the aggregate round-trip, export-aggregate and import-aggregate unit tests and the export recovery test.
- **Repository contract**: the moved memory repository keeps passing the shared repository contract; image admission through Import is asserted for SQLite and PostgreSQL by the existing integration suites.
- **Run module** (new seam): start on a fixture directory; commit an edit through the Fetch app; advance the injected clock; assert the directory. Also: stop flushes a pending write; a missing directory yields the new Space on disk; start-then-stop with no edit leaves the directory byte-for-byte unchanged; an uploaded image reaches `images/`; an edit during a write produces exactly one further write. Prior art: the database HTTP runtime and E2E HTTP runtime tests.
- **Process** (existing pattern): one integration test spawns `pnpm start` on a temp directory with `--no-open`, makes one edit over HTTP, sends SIGINT, and asserts the directory and exit code zero. Prior art: the hyper CLI integration test.
- **Skills**: the existing agent-skill symlink and command tests cover the two new skills.

## Out of Scope

- An npm package, Docker image, single-file executable or any published `bin`.
- Renaming the product, the repository or `hyper.json`.
- Detecting on-disk changes during a run, locking a directory against a second run, live reload from disk, or any merge.
- Undo inside the application.
- Running against SQLite or PostgreSQL — Running is always the memory store.

## Further Notes

- Tickets are under `.scratch/running/issues/`.
- The untracked `docs/adr/0112-…consolidating-adr…` in the working tree is not this work; ADR numbers here start at 0117.
