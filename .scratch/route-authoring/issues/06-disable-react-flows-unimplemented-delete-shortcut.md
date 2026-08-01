# 06 — Disable React Flow's unimplemented delete shortcut

**What to build:** Prevent React Flow's default Backspace/Delete behavior from
removing projected Cards or Edges while Hyper has no completed structural-delete
Edit. The graph must remain a projection of the authoritative Space rather than
entering a local, unpersisted deletion state.

**Blocked by:** nothing.

**Status:** open

- [ ] `ReactFlow` receives `deleteKeyCode={null}` until structural deletion is
  implemented through the completed-Edit seam.
- [ ] Pressing Backspace or Delete with a Card selected leaves the editor's live
  nodes, authoritative Space and persistence revision unchanged.
- [ ] Pressing Backspace or Delete with an Edge selected leaves the rendered
  Edges, authoritative Space and persistence revision unchanged.
- [ ] React Flow's accessibility instructions do not advertise Delete as a
  supported Card or Edge action.
- [ ] Regression coverage exercises the keyboard interaction through the public
  graph/editor boundary rather than calling React Flow internals.
- [ ] Future deletion work re-enables the shortcut only by translating it into
  one atomic completed Edit that removes the Card or Edge, repairs every affected
  Route and Layout reference, validates the resulting Space and submits the
  complete snapshot.
- [ ] `pnpm verify` and `pnpm e2e` pass.

## Context

React Flow enables Backspace/Delete removal by default. Hyper currently applies
owned node changes through `applyNodeChanges`, but Card and Edge deletion are not
implemented as completed authored Edits. A selected Card can therefore disappear
from the live controlled node array without changing or persisting the Space, and
may reappear only after a later projection sync.

Deletion remains future structural-authoring scope in
`.scratch/graph-editing/commands.md`; this issue does not implement that command.
It only closes React Flow's unsupported default path until the domain operation
exists.
