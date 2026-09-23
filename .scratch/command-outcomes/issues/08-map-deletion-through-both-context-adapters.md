# 08 — Map deletion through both context adapters

Status: ready-for-agent
Blocked by: 06

**What to build:** Move top-level and embedded Map deletion behind `MapAuthoringCommands.map(mapId).delete`. The asynchronous capability owns the last-Map rule, live availability and existence checks, cross-Space coordination, persistence gates, and navigation to the surviving Map and Active Graph. Completed outcomes carry the surviving identities and refused outcomes carry complete structured reports.

**Why:** Deletion contains the most important locality gain: the current callers each know how Space Resources constrain a Map deletion and how Navigation recovers afterwards. One module should make that decision once for both contexts.

- [ ] A Space's last Map is unavailable for deletion, and the capability rechecks that rule and Map existence when invoked.
- [ ] Top-level and embedded deletion use the same external interface while their persistence and preferred-selection differences remain behind private adapters.
- [ ] Every affected Space Resource is coordinated before completion, and the live target Space continues on the surviving Map and Active Graph when required.
- [ ] Unavailable, unchanged, refused and completed outcomes remain distinct; only refused outcomes carry a report.
- [ ] The shared contract suite proves both adapters, including stale invocation, last-Map, missing-Map, persistence failure and surviving-selection behavior.
- [ ] Ticket 05 and the workstream spec are reconciled so ticket 05 retains Graph deletion and no longer claims Map deletion.

