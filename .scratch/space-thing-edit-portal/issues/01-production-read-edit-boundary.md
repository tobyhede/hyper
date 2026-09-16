# 01 — Give an Open Space Thing a production Read/Edit boundary

**What to build:** An Open Space Thing offers Edit from its floating Thing Dock. In Read, its embedded target canvas is inert and dragging moves the containing Space Thing. Edit activates the real embedded canvas, including Diagram and Graph choices, canvas pan and zoom, Thing operations and Graph authoring; Done returns to Read. Target Space edits continue to persist immediately through existing Space Authoring. Compose the controls from the existing `@project/ui` command-surface and button primitives under the repository's shadcn-first rule.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Read makes the embedded target surface inert while leaving the containing Space Thing draggable from every exposed card surface.
- [x] Edit makes the embedded production canvas interactive and replaces Edit with Done on the one floating Thing Dock.
- [x] Diagram and Graph choices remain Space Thing edits; target Diagram, Thing and Graph edits retain their existing immediate-save behaviour.
- [x] Done returns to Read without discarding target edits or introducing a second command surface.
- [x] Application and Ladle browser proofs exercise pointer and keyboard entry and exit, outer dragging in Read, and inner canvas authoring in Edit.

## Comments

The Dock boundary this ticket asked for is built. “The real embedded canvas”
was implemented as a faked second camera on the decided sub-flow. The
follow-up is [`04`](04-edit-canvas-is-the-host-canvas.md): stay on that
model, fix handles and clip, do not reopen a nested instance. The product
rule is [the effort spec](../spec.md).

