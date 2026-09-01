# 01 — Open and edit a Space Card in place

**What to build:** Opening a Space Card shows the Layout and Graph selected
by that Card within the containing Space, and permits the target Space to be
edited without confusing its authored state with the containing Layout.

**Blocked by:** `entity-url-addressability/07` — Author a Space Card reference;
PR 134 delivered the aggregate foundation.

**Status:** ready-for-agent
Tags: release/v1

- [ ] Opening shows the Layout selected by the Space Card, not the target Space's
      own active selection, using that Layout's authored placement and Graph.
- [ ] Moving or resizing the Space Card authors the containing Layout. Editing
      content shown through the open Card authors the target Space.
- [ ] Interaction, focus and camera behavior remain coherent while the target is
      open and while returning to the containing Space.
- [ ] Application, Ladle and adapter evidence covers the selected Layout and
      Graph, resizing the Card, and persistence after editing the target.

## UX iteration

Compound sub-flow, nested canvas and other render compositions are candidates,
not acceptance criteria. Prototype them and keep whichever best satisfies the
outcomes above.

## Deferred

Cross-Space Edges, cross-Space traversal, nested presenting and their deep URLs
are outside V1.
