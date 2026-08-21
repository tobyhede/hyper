# 04 — Wire the skills into both harnesses

**What to build:** The repository wiring that makes both skills discoverable, tracked and covered by a test — and the decision that neither belongs in `skills-lock.json`.

**Status:** ready-for-agent

**Why:** A skill that exists but is not tracked is absent from every worktree; a skill that is tracked in one location serves one harness. Both failures have happened here before, which is why `workflow.md` records them.

- [ ] Confirm `.agents/skills/typescript-write/**` and `.agents/skills/typescript-review/**` and both `.claude/skills/` symlinks are **tracked**, not merely present. An ordinary `git worktree add` populates only tracked files.
- [ ] Keep both out of `skills-lock.json`. The lock records vendored upstream skills and their content hashes — it holds `shadcn` and deliberately not the repo-owned `shadcn-first-ui`. These two are repo-owned adaptations: the checked-in files are the source of truth and upstream provenance is recorded in the reference files, not in the lock. The source specification's suggestion to let the install mechanism update the lock is wrong for these.
- [ ] Add the AGENTS.md **Agent skills** entries — one short paragraph each, matching the existing entries, naming when to reach for each.
- [ ] Extend `test/unit/agent-skill-commands.test.ts` to cover the new skills. It already reads skill files and checks that backticked `pnpm` commands resolve to real root scripts, so a skill telling agents to run a command that does not exist fails `pnpm verify`. Add the two `SKILL.md` files and the reference files to what it reads.
- [ ] Add a test that both symlinks resolve to their `.agents/` targets, so a skill added for one harness and not the other fails rather than silently serving half the tooling.
- [ ] **Name both skills in AGENTS.md's verification bar**, so they are reachable by instruction when the trigger misses. A skill that never fires produces no error — nothing to notice — and this sentence is the cheap cover for that.
- [ ] **Run one recorded trigger pass by hand** against the finished skills, using the ordinary prompts from the source specification's §24, none of which mentions TypeScript: *"Add support for deleting an edge"*, *"Refactor this state so loading can be cancelled"*, *"Add a parser for the import metadata"*, *"Fix this component so it handles a missing graph"*, *"Add the new renderer option"*. Then *"Review this change"* over a TypeScript diff, for `typescript-review`. Record in this file what actually loaded each time.
- [ ] If the pass shows under-triggering, that is evidence for revisiting issue 07, not for building a harness now. Fix the trigger description first — it is the part an agent reads before deciding to load anything.
- [ ] `pnpm verify` and report the real output.
