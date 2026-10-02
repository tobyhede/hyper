# 04 — One canvas selection names its surface

**What to build:** Give each drawing an occurrence — the path of Space Resource nodes from the root Map to it — and replace the host selection plus the embedding's own selection with one canvas selection that names its occurrence. Continuation and in-progress gesture state become per canvas, keyed by occurrence. Keyboard commands, the rail and Undo/Redo dispatch through the selection.

**Blocked by:** 03.

**Status:** ready-for-agent

**Spec:** `.scratch/a-map-is-a-map/spec.md` (decisions 6, 8, 10, 18, 19, 20). **Decision:** ADR 0112.

## Acceptance criteria

- [ ] At most one Resource or Edge is selected on the canvas, and the selection names its occurrence; two drawings of the same Map are distinguished.
- [ ] Continuation is per canvas: a request carries the occurrence it was made in and is spent only there. Creating a Resource in the second of two drawings of one Map selects it and places the caret in that drawing.
- [ ] If the requesting occurrence stops being drawn before the Edit completes, the Edit stands and the continuation is dropped, with no fallback to another drawing.
- [ ] Enter, F2, Delete, `C`, paste and Connect to Resource act on the selection's surface; the "embedded node or host node" branches in `SpaceCanvas` are deleted, and Enter does the same thing in every surface.
- [ ] Undo and Redo act on the selection's Space, or the canvas's own Space when nothing is selected.
- [ ] The Command Dock always acts on the canvas's own Space.
