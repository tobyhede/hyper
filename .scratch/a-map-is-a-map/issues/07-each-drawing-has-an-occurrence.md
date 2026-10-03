# 07: Each drawing has an occurrence that selection and continuation follow

**What to build:** Every drawing has an occurrence — the path of drawing Resources (Space Resources, or Reference Resources whose Target is one) from the canvas's own Map to it. One canvas selection names its occurrence, and continuation and in-progress gesture state are per canvas, keyed by occurrence. Keyboard commands, the rail and Undo/Redo act through the selection, so a Resource behaves the same whichever drawing it is in.

**Blocked by:** 06.

**Status:** ready-for-agent

**Spec:** `.scratch/a-map-is-a-map/spec.md`. **Decision:** ADR 0112.

- [ ] At most one Resource or Edge is selected on the canvas, and the selection names its occurrence; two drawings of the same Map are told apart.
- [ ] A continuation is spent only in the occurrence that requested it; if that occurrence stops being drawn before the Edit completes, the Edit stands and the continuation is dropped, with no fallback.
- [ ] Enter, F2 and Delete act on the selection's occurrence and do the same thing in every drawing; the canvas has no separate embedded branch for them.
- [ ] Undo and Redo act on the selection's Space, or the canvas's own Space when nothing is selected.
- [ ] The Command Dock always acts on the canvas's own Space.
