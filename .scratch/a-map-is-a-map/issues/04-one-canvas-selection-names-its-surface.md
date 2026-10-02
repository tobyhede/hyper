# 04 — One canvas selection names its surface

**What to build:** Replace the host selection plus the embedding's own selection with one canvas selection whose value names the surface it belongs to. Keyboard commands, the rail and Undo/Redo dispatch through it.

**Blocked by:** 03.

**Status:** ready-for-agent

**Spec:** `.scratch/a-map-is-a-map/spec.md` (decisions 6, 10, 18). **Decision:** ADR 0112.

## Acceptance criteria

- [ ] At most one Resource or Edge is selected on the canvas, and the selection says which surface it is in.
- [ ] Enter, F2, Delete, `C`, paste and Connect to Resource act on the selection's surface; the "embedded node or host node" branches in `SpaceCanvas` are deleted, and Enter does the same thing in every surface.
- [ ] Undo and Redo act on the selection's Space, or the canvas's own Space when nothing is selected.
- [ ] The Command Dock always acts on the canvas's own Space.
