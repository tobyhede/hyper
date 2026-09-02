# 04 — Add explicit Layout management

Status: superseded — ADR 0079 retired the Computed View this ticket converted from; `layout-only-v1/01` owns Layout management
Tags: release/v1
Blocked by: none

**What to build:** Let an author explicitly create, rename, select and delete
Layouts. Per ADR 0079 an authored Layout starts empty with one empty Graph:
there is no conversion from a Computed View and no copying of Cards or
positions.

This ticket's conversion contract no longer describes the product. ADR 0079
removed Computed Views from V1, so there is nothing to convert from and Add
Layout creates an empty Layout instead of copying a resolved placement.
[`layout-only-v1/01`](../../layout-only-v1/issues/01-add-empty-layouts.md) owns
Add Layout and the rename, select and delete surface; the Layout independence and
reload criteria below moved there unchanged.

- [ ] Rename, select and delete operate on one Layout with clear empty and refusal
      states.
- [ ] Deleting a Layout does not delete Cards from the Space.
- [ ] Each Layout retains independent membership, placement, Open state, Open Size,
      Graphs and Active Graph through reload.
- [ ] Desktop and narrow-screen workflows have application and Ladle evidence.
