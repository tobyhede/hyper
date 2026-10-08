# 07: Each drawing has an occurrence that selection and continuation follow

**What to build:** Every drawing has an occurrence — the path of drawing Resources (Space Resources, or Reference Resources whose Target is one) from the canvas's own Map to it. One canvas selection names its occurrence, and continuation and in-progress gesture state are per canvas, keyed by occurrence. Keyboard commands, the rail and Undo/Redo act through the selection, so a Resource behaves the same whichever drawing it is in.

**Blocked by:** 06.

**Status:** resolved

**Spec:** `.scratch/a-map-is-a-map/spec.md`. **Decision:** ADR 0112.

- [x] At most one Resource or Edge is selected on the canvas, and the selection names its occurrence; two drawings of the same Map are told apart.
- [x] A continuation is spent only in the occurrence that requested it; if that occurrence stops being drawn before the Edit completes, the Edit stands and the continuation is dropped, with no fallback.
- [x] Enter, F2 and Delete act on the selection's occurrence and do the same thing in every drawing; the canvas has no separate embedded branch for them.
- [ ] Undo and Redo act on the selection's Space, or the canvas's own Space when nothing is selected. Deferred until the application has history (Scope clarification).
- [x] The Command Dock always acts on the canvas's own Space.

## Scope clarification

The user confirmed on 2026-10-03 that Undo/Redo remains deferred until the application has history. V1 has no Undo/Redo implementation. The remaining occurrence, selection, keyboard and continuation requirements stay in scope.

## Answer

Selection dispatch resolves one occurrence for root and embedded drawings. Enter, F2, Delete and keyboard creation use that occurrence; adapters and continuations are scoped to the drawing. Unmounting drops its pending continuation. The Dock retains the root composition. Undo/Redo is deferred as recorded in Scope clarification.

Delivered by PR #332, merged 2026-10-04 with its CI gate green. The 2026-10-08 closeout verification, and the tests it added in PR #346, are recorded in `implementation-review.md`.
