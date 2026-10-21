# 09 — The aggregate reader pulls from a source

Status: ready-for-agent

**What to build:** the directory reader takes an `AggregateSource` and decides everything a read involves, instead of taking bytes a caller has already chosen and fetched (ADR 0130, "One directory reader, fed by sources").

Today each caller lists, asks `scannedAggregatePaths` what to read, reads with its own pool and its own failure policy, and hands `readAggregateFiles` a map, which scans the paths again. The two callers already refuse the same directory differently.

- **`AggregateSource`** in `@project/aggregate`: its name (used in diagnostics as `<name>/<path>`), a listing of one directory (its files and child directories; a missing directory lists empty), a read of one file answering its bytes or the reason it could not be read (never throwing), and the number of reads it allows at once.
- **The reader** reads an aggregate from a source. It lists the root, and refuses a missing `hyper.json` with today's discovery sentence. It then reads and parses `hyper.json` before anything else, so a malformed one stops the read with nothing else read. Next it lists each child directory, the `resources/` of each one holding `space.json`, and `images/`, and reads what today's scan reads, through one pool bounded by the source. Every file that could not be read is collected, and each Space's are reported together as today. A listing that fails stops the read as a discovery failure naming the directory. Id minting, Space ordering, image admission and every existing diagnostic are unchanged.
- **The listing-only scan** is one reader operation over a source, answering the files Import reads, in read order, and the Space directories among them. Export's ownership scan (`scannedAggregateFiles`) and `assertExportableDestination` use it, so `scannedAggregatePaths` and `spaceDirectoryNames` go.
- **Three adapters:**
  - `directorySource` in `src/aggregate-directory/`, the disk at 32 reads at once. It keeps today's link behaviour exactly: a link to a regular file is a file except in `images/`, and `images/` and a `resources/` are listed through a link.
  - `mapSource` in `@project/aggregate`, over bytes already in memory, for Export's read-back and the tests.
  - The mount's interim adapter: `mountAggregate` takes a source, and in this ticket the mounted startup still fetches every blob through today's GitHub source and wraps the result in a `mapSource`. Mount behaviour does not change here; ticket 10 changes it.
- `readAggregateFiles` and `scannedAggregatePaths` leave the package's surface, as do `parseSingleSpace` and `refuseSpaceDocument` if nothing outside it still needs them. `readAggregate(path, newId)` stays as the shell's entry point, if keeping it reads better than inlining `directorySource`.
- Docs that describe today's shape move with the code: `AGENTS.md` and `CLAUDE.md` (the `aggregate` package entry), and `docs/agents/editing-and-persistence.md` (the "pure core" bullet and the Export bullet's `readAggregateFiles` and `scannedAggregateFiles`).

**Out of scope:** the link rule itself (Import vs Export vs Mounting), a shared "establish a fresh store" step for Run and Mount, and the single-Space reader. Each is a separate architecture review candidate.

**Depends on:** nothing.

**Acceptance:**

- `test/unit/read-aggregate.test.ts`'s `READERS` runs every shared case through `directorySource` and `mapSource` over the same files, expecting the same contents or the same diagnostics. Link cases stay disk-only.
- The ordering of reads is pinned by a test: a malformed `hyper.json` reads no other file, and a `mapSource` that records reads shows it.
- A source's bound is honoured: a recording source never sees more reads in flight than it allows.
- Export's read-back, ownership scan and refusal of a misnamed Space directory pass unchanged.
- `pnpm e2e:mount` and the mount unit tests pass unchanged.
