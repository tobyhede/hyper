# 01 — Add empty Layouts as an ordinary authoring operation

Status: ready-for-agent
Tags: release/v1
Blocked by: none

**What to build:** Let an author add and select an empty Layout whose initial
empty Active Graph is created in the same Edit, as ADR 0079 requires. Existing
Cards remain in the Cards View until explicitly added, and the Cards drawer
reveals that next step once without becoming authored state.

- [ ] Add Layout creates a fresh Layout with the next neutral title, an empty
      placement and one freshly identified empty Active Graph, then selects and
      persists it as one Edit.
- [ ] Existing Cards and other Layouts remain unchanged; every existing Card is
      available from the new Layout's Cards View.
- [ ] The Cards drawer opens once after successful creation, respects dismissal
      and does not reopen because of unrelated state changes.
- [ ] Rename, select and delete each operate on one Layout with clear empty and
      refusal states.
- [ ] Deleting a Layout never deletes its Cards, while deleting the last Layout
      is refused with stable domain identity and accessible application wording.
- [ ] Add, rename, select and permitted delete operations retain independent
      membership, placement, Open state, Open Size, Graphs and Active Graphs
      through reload.
- [ ] Production UI work follows the shadcn-first workflow, with application,
      Ladle and Ladle-E2E evidence for desktop and narrow screens.

This ticket owns the Add Layout operation and the complete Layout management
surface for V1; it does not own the initial Layout created as part of a new
Space, which [Layout-only V1/02](02-initialize-layoutless-space-on-first-working-load.md)
owns beside first-working-load repair. [V1/04](../../v1-release/issues/04-add-layout-management.md)
defers its Layout lifecycle criteria here.
