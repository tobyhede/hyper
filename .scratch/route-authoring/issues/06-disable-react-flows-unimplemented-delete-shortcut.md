# 06 — Disable React Flow's unimplemented delete shortcut

**What to build:** Prevent React Flow's default Backspace/Delete behavior from
removing projected Cards or Edges while Hyper has no completed structural-delete
Edit. The graph must remain a projection of the authoritative Space rather than
entering a local, unpersisted deletion state.

**Blocked by:** nothing.

**Status:** resolved

- [x] `ReactFlow` receives `deleteKeyCode={null}` until structural deletion is
  implemented through the completed-Edit seam.
- [x] Pressing Backspace or Delete with a Card selected leaves the editor's live
  nodes, authoritative Space and persistence revision unchanged.
- [x] Pressing Backspace or Delete with an Edge selected leaves the rendered
  Edges, authoritative Space and persistence revision unchanged.
- [x] React Flow's accessibility instructions do not advertise Delete as a
  supported Card or Edge action.
- [x] Regression coverage exercises the keyboard interaction through the public
  graph/editor boundary rather than calling React Flow internals.
- [x] Future deletion work re-enables the shortcut only by translating it into
  one atomic completed Edit that removes the Card or Edge, repairs every affected
  Route and Layout reference, validates the resulting Space and submits the
  complete snapshot.
- [x] `pnpm verify` and `pnpm e2e` pass.

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

## Evidence

- `packages/app/src/components/GraphView.tsx` disables React Flow's delete key,
  retains controlled Edge selection without accepting structural Edge changes,
  and supplies accurate Card and Edge keyboard descriptions.
- `packages/app/e2e/editing.spec.ts` proves Backspace and Delete preserve Cards,
  Edges, authoritative persistence and revision after selecting either kind of
  element, and checks that assistive descriptions advertise no deletion.
- Follow-up after review: the replacement Edge description offered "Press enter or
  space to select an Edge" while `edgesFocusable` is false, so it named a key no
  Edge can receive — the same class of inaccuracy this issue set out to remove.
  The description now claims no key, and a second test holds the two facts
  together so neither can drift from the other.
- Final verification on 2026-08-01: `pnpm verify` passed 63 test files and 532
  tests; `pnpm e2e` passed all 59 tests; `pnpm build` completed successfully.
