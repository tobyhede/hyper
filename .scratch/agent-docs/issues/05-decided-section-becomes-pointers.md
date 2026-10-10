# 05: Turn AGENTS.md's "Decided" section into pointers

**What to build:** each ADR entry in AGENTS.md's "Decided" section becomes one line: its build status, the guide that owns its rules, and its open ticket if there is one. The rules themselves live only in the topic guides. An agent therefore meets one copy of each rule, the copy that is kept current.

**Blocked by:** 01, 04.

**Status:** ready-for-agent

- [ ] No rule stated in the Maps-and-Graphs, editing-and-persistence, rendering or UI guides is restated in AGENTS.md.
- [ ] A rule that has no home yet moves into the guide that owns its area before AGENTS.md loses it.
- [ ] ADR 0112 has its own entry instead of sitting inside ADR 0070's.
- [ ] The stale-citation guard from 04 passes.
