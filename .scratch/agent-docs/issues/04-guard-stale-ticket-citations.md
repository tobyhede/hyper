# 04: Make a stale ticket citation in the agent docs fail a test

**What to build:** text in AGENTS.md or `docs/agents/*` that says something is not built until a cited `.scratch` ticket, or that a cited ticket's work is "being built", fails a unit test once that ticket's `Status:` is resolved. This is the drift that left AGENTS.md calling the ADR 0122 resize control unbuilt after its ticket was resolved.

**Blocked by:** 01.

**Status:** ready-for-agent

- [ ] The guard reads ticket statuses in both spellings the tracker uses.
- [ ] It fails on a fixture that pairs "until" or "being built" with a resolved ticket, and passes on today's corrected docs.
- [ ] It sits beside `docs-agents-citation-accuracy` and runs in `verify`.
