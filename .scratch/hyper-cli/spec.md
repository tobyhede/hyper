# One Hyper CLI

Status: ready-for-agent

## Problem Statement

Hyper's commands accreted rather than being designed. `pnpm hyper` is a database tool whose verb is implied by its arguments (bare initializes, a path imports, `export` exports); `pnpm hyper:sqlite` is the same tool again, the store chosen by script name; and `pnpm start <dir>` runs an Aggregate directory as a separate script. Three entry points, two ways of choosing a store and two argument styles leave an author unable to tell which command to run. `pnpm start` also turns a mistyped path to an existing talk into a silently created new aggregate.

## Solution

One CLI, every command a verb (ADR 0124):

```
pnpm hyper init <dir>                                   # new aggregate → missing/empty <dir>; refuses otherwise; prints the run command; does not serve
pnpm hyper run <dir> [--port <port>] [--no-open]        # existing Aggregate directory only; missing/empty → refused, pointing at init
pnpm hyper import <dir> [--store postgres|sqlite] [--dangerous-replace]
pnpm hyper export <dir> [--store postgres|sqlite]
pnpm hyper help | --help                                # author verbs, then developer verbs
```

Removed, with no aliases: `pnpm start`, `pnpm hyper:sqlite`, bare `pnpm hyper` (initializing a database is the hosts' start-up), and `--dangerous-truncate`.

## User Stories

1. As an author, I want `pnpm hyper init ~/talks/new` to make a new Aggregate directory and tell me the command that runs it, so that starting a talk has an obvious first step.
2. As an author, I want `pnpm hyper run ~/talks/rust-asycn` (a typo) refused, naming `init`, so that a mistyped path never becomes a new aggregate.
3. As an author, I want `init` refused on a directory that is not empty, so that it never writes over or beside my work.
4. As an author, I want `pnpm hyper help` to list every verb, author verbs first, so that I can see the whole tool at once.
5. As an author, I want `run` to keep today's behaviour on an existing directory — write-through, flush on SIGINT/SIGTERM/SIGHUP, second signal exits, `--port`, `--no-open` — so that nothing about Running changes but its name.
6. As a Hyper developer, I want `import` and `export` to choose PostgreSQL or SQLite with `--store`, so that one command line works against either database.
7. As a Hyper developer, I want replacing a stored aggregate to need `--dangerous-replace`, so that the destructive door stays explicit and says what it does.
8. As an agent, I want `init` to write and exit without serving, so that creating an aggregate is a deterministic step I can script.

## Implementation Decisions

- **Verbs and flags** are ADR 0124's. A usage error, including `--store` on `init` or `run` and bare `hyper`, prints the usage line and exits 2.
- **Empty** means what it means for Running today: missing, or holding only dot-entries.
- **`init`** establishes the Meta Space as a new space and Exports it through the existing Export, as `startRun` does for an empty directory now; it reuses that code rather than adding a second path.
- **`run`** is today's launcher (`scripts/start.ts`, `scripts/start-run.ts`) behind the `run` verb. The launcher owns signals and must be the process pnpm signals, which is why the `start` script `exec`s it today; the `hyper` script must preserve that for `run`, and `start-command.test.ts`'s `exec` assertion moves with it.
- **One entry point** replaces `src/cli/entry.ts` and `src/cli/sqlite-entry.ts`; the database target is chosen from `--store` inside it.

## Testing Decisions

- Extend the existing CLI tests (`test/unit/hyper-cli.test.ts`, `test/integration/hyper-cli.test.ts`, `test/integration/sqlite-hyper-cli.test.ts`) and the start-command integration test (renamed for `run`) rather than adding parallel suites.
- `init` and `run`'s refusals are unit-tested in the node environment; one integration test spawns `pnpm hyper run --no-open` as `start-command.test.ts` spawns `pnpm start` today.

## Out of Scope

- A `bin` entry for a bare `hyper` command.
- Running against a database.
- `git init` from `init`.
