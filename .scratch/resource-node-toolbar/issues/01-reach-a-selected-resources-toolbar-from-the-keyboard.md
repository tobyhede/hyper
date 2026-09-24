# 01 — Reach a selected Resource's toolbar from the keyboard

Status: needs-triage

**What to build:** From a focused, selected Resource, the keyboard reaches that Resource's floating toolbar next, rather than the next Resource on the canvas.

## Why

ADR 0102 moved a Resource's commands into React Flow's `NodeToolbar`, which portals into `.react-flow__renderer` after every node and Edge. So in document order the toolbar follows every Resource rather than its own, and Tab from a selected Resource reaches the next Resource. ADR 0073's shape — Tab traverses Resources, the arrows traverse one Resource's commands — no longer holds as written. Inside the toolbar the roving tabindex is unchanged.

Whether this is answered by focus management, a key that moves into the toolbar, or accepted as the cost of the library's shape is a decision to take before building; ADR 0102 records it as open work.

## Acceptance criteria

- [ ] The decision is recorded (in ADR 0102 or a successor).
- [ ] If built: from a selected Resource, the keyboard reaches its toolbar's first command without passing another Resource, and an e2e test proves it.
