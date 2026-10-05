# 03: Running an Aggregate directory

**What to build:** `pnpm start <dir>` serves an Aggregate directory directly (see `CONTEXT.md`, Running, and `../spec.md`). It Imports the directory into a fresh memory repository — or, when the directory is missing or empty, establishes the new Space and writes it there at once — serves the application, Exports back to the directory after each committed edit once edits have been quiet for about a second, and flushes on stop. It prints the URL, opens the browser unless `--no-open`, uses port 4173 or the next free one unless `--port` is given. SIGINT, SIGTERM and SIGHUP each flush and exit zero; a second signal forces exit. Record the decision as ADR 0117.

**Blocked by:** 01 — The memory repository is a production store.

**Status:** ready-for-agent

- [ ] ADR 0117 (Running) is written: directory is the durable copy, store is ephemeral, write-through plus final flush, git assumed for history, undo and concurrent writers, last write wins, crash-before-flush loss accepted
- [ ] A Run module is the one new seam: start on a directory, answer the served host and a stop operation; the clock is injected at composition (ADR 0109)
- [ ] An edit committed through the Fetch app reaches disk after the quiet period
- [ ] Stop flushes a pending write and waits for it
- [ ] Writes are serialised: an edit during a write produces exactly one further write
- [ ] Start then stop with no edit leaves the directory byte-for-byte unchanged
- [ ] A missing or empty directory yields the new Space on disk; an invalid directory, or a single Space without `hyper.json`, is refused non-zero with the intake errors printed
- [ ] The launcher drives Vite programmatically with the Run module as its HTTP runtime and owns the signals; one integration test spawns `pnpm start --no-open` on a temp directory, edits over HTTP, sends SIGINT and asserts the directory and exit code zero
- [ ] With ticket 02 merged, an image uploaded during a run reaches `images/` (asserted once 02 is in)
- [ ] AGENTS.md's Commands section lists `pnpm start <dir>`, and states it is safe for an agent to start on a directory of its own (unlike the dev hosts)
- [ ] Targeted local checks pass; the draft PR's `CI passed` is green
