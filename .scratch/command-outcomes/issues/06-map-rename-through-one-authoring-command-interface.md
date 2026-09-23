# 06 — Map rename through one authoring command interface

Status: ready-for-agent
Blocked by: 01

**What to build:** Introduce `MapAuthoringCommands` as the one interface for Map Edits, with Space-scoped creation and Map-addressed rename and deletion capabilities. Complete the rename slice through both the top-level Space and an embedded Space Resource: each capability pairs availability with synchronous invocation, rechecks live availability when invoked, and returns a complete structured report when Space Authoring refuses the rename. Command outcomes owns the report's lifetime and dismissal; the Map authoring module owns its title and message.

**Why:** Top-level and embedded Map rename currently repeat availability, completion and refusal conversion at different call sites. This first slice establishes the deep module and proves that its two private adapters share one test surface before asynchronous coordination joins it.

- [ ] `MapAuthoringCommands` exposes Space-scoped creation and `map(mapId)` for Map-addressed rename and deletion; unavailable capabilities cannot be confused with refused Edits.
- [ ] Top-level and embedded Map rename use the same synchronous capability, while Map selection, Copy link, focus and notice markup remain outside the module.
- [ ] Invocation rechecks live general availability and Map existence; a stale invocation answers `unavailable` without publishing a refusal report.
- [ ] A refused rename returns the complete Map report, and command outcomes publishes, dismisses and clears it without interpreting an `AuthoringRefusal`.
- [ ] A shared contract suite runs the rename behavior against both private adapters; application coverage proves the existing inline rename treatment still holds a refused draft open.
- [ ] Ticket 02 and the workstream spec are reconciled so ticket 02 retains Graph and Reference Resource refusals and no longer claims Map outcomes.

