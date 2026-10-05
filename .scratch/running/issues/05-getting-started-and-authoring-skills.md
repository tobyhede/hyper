# 05: Getting-started and authoring skills

**What to build:** Two agent skills, tracked in `.agents/skills/` with `.claude/skills/` symlinks. `hyper-getting-started` lets an agent set a human up from a fresh clone: check Node and pnpm, install, choose or create the content directory (its own git repo), start a run with `pnpm start`, and explain that git is the undo. `hyper-authoring` lets an agent author an Aggregate directory as files: `hyper.json`, Space directories named by Id, `space.json` (Maps, Graphs, Edges, placement), Resource Markdown, `images/`, which Ids may be omitted, what Export removes, and the rule to stop the run before editing files because a write-through overwrites them.

**Blocked by:** 02 — Image bytes travel in the Aggregate directory; 03 — Running an Aggregate directory.

**Status:** ready-for-agent

- [ ] Both skills follow `writing-for-agents` conventions, with descriptions that trigger on starting Hyper and on editing an Aggregate directory respectively
- [ ] `hyper-authoring` points at `docs/aggregate-directory.md` for the full reference rather than restating it
- [ ] Each skill's steps were carried out once as written
- [ ] The existing agent-skill symlink and command unit tests pass with the new skills
- [ ] Targeted local checks pass; the draft PR's `CI passed` is green
