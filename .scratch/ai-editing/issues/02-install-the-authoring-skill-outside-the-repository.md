# 02: Install the authoring skill outside the repository

**What to build:** a person can add `infinity-cube-authoring` to an agent that is not working in an InfinityCube clone (Claude.ai, Claude Code in a content repository, Codex) and author a talk's Aggregate directory with it. Today the skill links to `docs/aggregate-directory.md` by a relative path inside this repository and its check step runs from the clone.

**Blocked by:** 01

**Status:** needs-triage

- [ ] The skill carries, or links by a stable URL, the format reference it relies on
- [ ] It says how to check a directory when no InfinityCube clone is at hand, or that one is needed
- [ ] The repository has one copy of the skill, which the packaged one is built from rather than hand-copied
