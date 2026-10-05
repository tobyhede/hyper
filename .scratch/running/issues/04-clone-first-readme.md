# 04: Clone-first README

**What to build:** A newcomer reading the README can be running Hyper on their own directory in minutes. The README opens with what Hyper is and a quick start (clone, `pnpm install`, `pnpm start ~/talks/x`, edit, Ctrl-C, commit in that repo), then how Running works, then using Hyper with agents, then "Developing Hyper", which keeps the database, dev-server and verify instructions and points at AGENTS.md. The format reference (Aggregate directory, `space.json`, durable URLs, HTTP resources) moves to `docs/aggregate-directory.md`.

**Blocked by:** 02 — Image bytes travel in the Aggregate directory; 03 — Running an Aggregate directory.

**Status:** ready-for-agent

- [x] The quick start uses only commands that exist, and was run as written on a fresh temp directory
- [x] "How Running works" says: content lives in its own git repo at any path; Hyper writes the working tree on every edit; git is your undo, including for a pull mid-run or two runs on one directory; a crash before a write is the one accepted loss; a `*.md` beside `space.json` is removed by Export; pictures are written to `images/`
- [x] "Using Hyper with agents" names the two skills from ticket 05
- [x] "Developing Hyper" keeps every contributor instruction the current README has
- [x] `docs/aggregate-directory.md` holds the moved format reference, including `images/`
- [x] No retired vocabulary (`CONTEXT.md` _Avoid_ lists); `prettier --check` passes on the changed files
