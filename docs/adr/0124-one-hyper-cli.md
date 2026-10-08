# One Hyper CLI

Status: accepted
Refines: 0078, 0117
Related: 0018, 0094, 0119

Every command Hyper offers is a verb of one CLI, `pnpm hyper <verb>`:

```
pnpm hyper init <dir>
pnpm hyper run <dir> [--port <port>] [--no-open]
pnpm hyper import <dir> [--store postgres|sqlite] [--dangerous-replace]
pnpm hyper export <dir> [--store postgres|sqlite]
pnpm hyper help
```

`pnpm start`, `pnpm hyper:sqlite`, bare `pnpm hyper` and `--dangerous-truncate` are removed, with no aliases. The commands had accreted rather than been designed: a database tool whose verb was implied by its arguments, a second script for the second database, and Running added beside them as its own script because it needs a launcher process. Three entry points, two ways of choosing a store and two argument styles left an author unable to tell which command to run. One verb list, with the author's verbs (`init`, `run`) first and the developer's (`import`, `export`) after, is the fix.

**Creating and Running are separate acts.** `init` establishes a new aggregate, whose Meta Space is a new space (ADR 0018), Exports it to a missing or empty directory, prints the `run` command for it and exits; it refuses a directory that is not empty. `run` serves an existing Aggregate directory only, and refuses a missing or empty one, pointing at `init`. This refines ADR 0117, under which a missing or empty directory was established as the new Space and served. The reason is that a mistyped path to an existing talk, `~/talks/rust-asycn`, then silently became a new aggregate instead of an error. The cost accepted is that the quick start is two commands rather than one. A directory holding only dot-entries, such as `.git`, is empty for both verbs.

**The store is a flag, never inferred.** `import` and `export` take `--store postgres|sqlite`, defaulting to `postgres`; connection details stay in `DATABASE_URL` and `SQLITE_PATH`. Inferring the store from which variable is set was rejected, because `--dangerous-replace` against the wrong store destroys data. `init` and `run` refuse `--store` as a usage error: `run` always uses a fresh memory store (ADR 0117), and an ignored flag would suggest otherwise.

**The two lifecycle doors keep a flag, named for the act.** `import` establishes the aggregate of a store that has none and refuses an initialized one; `import --dangerous-replace` replaces the stored aggregate outright (ADR 0078, ADR 0094). This refines only how the CLI spells the second door. "Replace" is the glossary's word for what Importing does, where "truncate" was the database's. A separate `replace` verb was rejected so that the usage text does not list a destructive verb among the safe ones, and a bare `--dangerous` was rejected because it does not say what is dangerous.

**Initializing a database is not a command.** Bare `hyper` used to establish a new Meta Space in an empty database. The database hosts already do that at start-up, so the form is removed and bare `hyper` prints usage. A usage error exits 2.
