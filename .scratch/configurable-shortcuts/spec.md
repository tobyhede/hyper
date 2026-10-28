# Configurable shortcuts

Status: needs-triage

ADR 0138 (proposed). Every key the application answers becomes a key bound to a named command, answered by one dispatcher from a keymap. The defaults are today's binding table (`packages/app/src/key-bindings.ts`). A reader can remap a command's keys or turn them off from the `?` sheet, and can turn off every single-character shortcut at once, which is what WCAG 2.1.4 (Character Key Shortcuts) asks of keys answered outside one focused component. Overrides live in `localStorage`, which is per origin: each dev host, `pnpm hyper run` and each host serving a mounted page keeps its own.

Builds on the keyboard-shortcuts stack (`.scratch/keyboard-shortcuts/`, PRs #426–#430), merged into `main` on 2026-10-28. Every file, binding and test the tickets name is on `main` from then; this branch was cut before the stack and does not carry them. Ticket 01 is the follow-up the #426 review left open: one keydown dispatcher in place of the canvas's per-command listeners.

Review each ticket against the practices in `research.md`, citing their IDs (`BP-*`).

Not in scope: Undo (`.scratch/keyboard-shortcuts/issues/09-undo.md`), the editor's own Save and Cancel in `@project/ui`, and syncing overrides between browsers.

| Ticket | What | Depends on |
| --- | --- | --- |
| 01 | Command ids and one dispatcher | the stack (merged) |
| 02 | The effective keymap: defaults plus overrides | 01 |
| 03 | Overrides kept in this browser | 02 |
| 04 | Turn single-character shortcuts off | 03 |
| 05 | Rebind a command from the `?` sheet | 03 |
| 06 | Take over the keys React Flow performs | 01 |
