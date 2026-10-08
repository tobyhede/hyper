# 02: `init` and `run`

**What to build:** The author's two verbs (see `../spec.md` and ADR 0124). `pnpm hyper init <dir>` establishes a new aggregate and Exports it to a missing or empty `<dir>`, prints `pnpm hyper run <dir>`, and exits without serving; it refuses a directory that is not empty. `pnpm hyper run <dir>` is today's `pnpm start` on an existing Aggregate directory, unchanged, and refuses a missing or empty one with a message naming `init`. `pnpm start` is removed.

**Blocked by:** 01 — The database verbs.

**Status:** ready-for-agent

- [ ] `init` on a missing or empty directory (dot-entries do not count) writes a valid Aggregate directory whose Meta Space is a new space, prints the `run` command, and exits 0 without serving
- [ ] `init` on a directory that is not empty is refused non-zero and writes nothing
- [ ] `init` reuses the code `startRun` uses for an empty directory today; there is one way to establish a new aggregate on disk
- [ ] `run` on an existing directory behaves exactly as `pnpm start` does: write-through after the quiet period, flush on SIGINT, SIGTERM and SIGHUP, second signal exits at once, `--port`, `--no-open`, port 4173 or the next free one
- [ ] `run` on a missing or empty directory is refused non-zero with a message naming `pnpm hyper init`, and writes nothing
- [ ] `init` and `run` refuse `--store` as a usage error
- [ ] The `hyper` script is the process pnpm signals for `run` (as `start` `exec`s today), and the start-command integration test, renamed for `run`, still asserts it
- [ ] `pnpm start` is gone, with no alias
- [ ] Targeted local checks pass; the draft PR's `CI passed` is green
