# 01 — Edit a Card Title on one activation

**What to build:** A Card's displayed Title becomes the direct control for editing that Title. One pointer or keyboard activation enters the existing inline editor without selecting or Opening the Card, while the rest of the Card keeps its existing gestures.

**Blocked by:** None — can start immediately.

**Status:** resolved
Tags: release/v1

- [x] When Title authoring is available, the displayed Title exposes a semantic control with an accessible name that identifies the edit action and Card; click, `Enter`, and `Space` replace it in place with the Title field, focus the field, and select its complete value.
- [x] Activating the Title neither selects nor Opens the Card, clicking elsewhere still selects it, the rail's Edit control still Opens it, and double-click is no longer an additional Title-editing convention.
- [x] `F2`, valid `Enter` or blur completion, `Escape` cancellation, refusal feedback, and keyboard focus return retain their established behavior.
- [x] Hover and focus visibly disclose the Title control without making it look like a form button or adding another pencil control.
- [x] Stable component, catalogue, and application-level tests prove pointer, keyboard, accessibility, focus, and gesture-boundary behavior.

## Verification

- `pnpm verify` — passed.
- `pnpm e2e` — 119 passed.
- `pnpm e2e:ladle` — 41 passed.
