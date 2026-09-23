# 09 — Contract the old Map command interface

Status: ready-for-agent
Blocked by: 07, 08

**What to build:** Make the Command Dock and embedded Space Resource rail consume the completed `MapAuthoringCommands` capabilities directly. Remove the separate Map create/delete availability flags, duplicated callbacks and Map-specific coordination paths that the deep module replaces. Keep selection, Copy link, focus, report lifetime and visible treatment with their existing owners.

**Why:** Tickets 06–08 expand the new form beside the old so each operation can land green. This ticket completes the refactor: the old interface and tests disappear only after every Map Edit crosses the new seam.

- [ ] Each surface derives unavailable treatment and invocation from one paired capability; no separate Map availability flag can disagree with its operation.
- [ ] The old top-level and embedded Map command callbacks and Map-specific coordination paths are deleted without changing Graph command behavior.
- [ ] Superseded helper tests are removed once the shared adapter contract covers their behavior; tests that prove distinct treatment remain.
- [ ] The Command Dock retains the exclusive Map selection, addressing remains beside authoring, and caret continuation remains surface-owned.
- [ ] The deletion test holds: removing `MapAuthoringCommands` would redistribute availability, coordination, persistence ordering, recovery and report translation across both callers.
- [ ] Static verification, application end-to-end tests and Ladle behavior tests are green.

