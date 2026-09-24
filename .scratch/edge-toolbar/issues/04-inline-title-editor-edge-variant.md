# 04 — An `edge` variant of `InlineTitleEditor`

Status: ready-for-agent

**What to build:** A third `InlineTitleEditorVariant`, `edge`, whose single-line field is drawn as the Edge Title it replaces: no box of its own, centred, `field-sizing: content` with a floor and a 14rem ceiling, the Edge Title's type (12px, the Resource Title's weight and ink).

**Why:** `className` reaches only the editor's wrapper, so the prototype restyled the input by descendant selector (`FIELD_AS_TITLE`). That is a prototype workaround, not a pattern to ship.

- [ ] Covered in `InlineTitleEditor.test.tsx` beside the `resource` and `header` variants.
