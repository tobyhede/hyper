# 01: Check an Aggregate directory without running it

**What to build:** `pnpm cube check <dir>` reads an Aggregate directory exactly as `pnpm cube run` does and reports whether intake accepts it, without serving it, starting a server or writing a file. An accepted directory exits zero and says so; a refused one prints the same problems `run` prints and exits non-zero; a missing or empty one is refused with the `pnpm cube init` command, as `run` refuses it. The `infinity-cube-authoring` skill's check step and `docs/aggregate-directory.md` use it in place of a headless run on a copy.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `check` is listed by `cube help` among the author's verbs, after `run`
- [ ] An accepted directory exits 0 and leaves every file byte-for-byte unchanged, including a hand-written directory that omits Map and Graph Ids
- [ ] A refused directory prints the same diagnostics as `run` and exits 1
- [ ] A missing or empty directory is refused with the `pnpm cube init` command and exits 1
- [ ] A relative `<dir>` resolves against where `pnpm` was invoked, as for every verb
- [ ] `check` and `run` share one reading of the directory, so they cannot disagree about what is refused
- [ ] The authoring skill and the Aggregate directory reference use `pnpm cube check`
