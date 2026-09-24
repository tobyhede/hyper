# 04 — An `edge` variant of `InlineTitleEditor`

Status: resolved

**What to build:** A third `InlineTitleEditorVariant`, `edge`, whose single-line field is drawn as the Edge Title it replaces: no box of its own, centred, `field-sizing: content` with a floor and a 14rem ceiling, the Edge Title's type (12px, the Resource Title's weight and ink).

**Why:** `className` reaches only the editor's wrapper, so the prototype restyled the input by descendant selector (`FIELD_AS_TITLE`). That is a prototype workaround, not a pattern to ship.

- [x] Covered in `InlineTitleEditor.test.tsx` beside the `resource` and `header` variants.

## Answer

`InlineTitleEditorVariant` is now `'resource' | 'header' | 'edge'`, with no new props.

`variant="edge"`:
- draws the single-line `Input`, unless a caller sets `multiline`, which no Edge should
- gives the field the class `inline-title-editor__edge-field`
- wraps it in the same `Field` + `FieldError` as `header`, plus `inline-title-editor--edge` (centred, `width: max-content`)

A refused completion keeps the field open and focused, `aria-invalid`, with the reason in a `role="alert"` `FieldError` under the field. If ticket 05 wants the reason in the toolbar's alert region instead, it can hold the refusal through the controlled `draft`/`error` props. The editor still draws its own `FieldError` in that case, so the reason would show twice. Ticket 05 decides that.

The drawing is in a new colocated sheet, `packages/ui/src/inline-title-editor.css`, which `InlineTitleEditor.tsx` imports. It is unlayered, as `.resource__title-input` is, so it beats `Input`'s and `Field`'s utilities. On the field it sets:

- no box: `border: 0`, `border-radius: 0`, `padding: 0`, `outline: 0`, `background: transparent`, `box-shadow: none`
- `text-align: center` and `field-sizing: content`
- `min-width: var(--inline-title-editor-edge-floor)` (3rem) and `max-width: var(--inline-title-editor-edge-ceiling)` (14rem)
- `font-size` 12px, `line-height` 1.25 and `font-weight` 600, each through its own `--inline-title-editor-edge-*` token
- `color: var(--canvas-resource-title-color)`

The Resource's `--canvas-resource-title-size` and `-weight` are scoped to `.canvas-resource`, which an Edge is not inside. So the size is stated as the ladder's caption rung, and the weight is a local token that the test holds equal to `--canvas-resource-title-weight`. The box, the editing underline and the Graph-coloured border stay the Edge's wrapper's, which is ticket 05's.

This deliberately replaces the prototype's `FIELD_AS_TITLE` descendant-selector restyle. Tailwind utilities were not used: the Resource sheet keeps Resource type off the chrome's `font-*`/`text-*` vocabulary, and arbitrary sizes are structurally guarded.

Tests in `InlineTitleEditor.test.tsx`:
- `edge` joins `resource` and `header` in the single-line case.
- A new `InlineTitleEditor edge variant` block covers: the edge class and not the Resource one, select-on-entry, Enter completes and Escape cancels (each returning focus), and a refused draft staying open with its alert.
- The same block reads the sheet for the no-box, centred, content-sized declarations and holds the weight to the Resource's token.

Verified with ticket 03: `pnpm verify` green (241 files; 3115 passed, 13 skipped) and `pnpm e2e:ladle` green (115 passed). `pnpm e2e` was not run: nothing in the application mounts the variant yet.
