# 01 — Edit a Card Title on one activation

**What to build:** A Card's displayed Title becomes the direct control for editing that Title. One pointer or keyboard activation enters the existing inline editor without selecting or Opening the Card, while the rest of the Card keeps its existing gestures.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] When Title authoring is available, the displayed Title exposes a semantic control with an accessible name that identifies the edit action and Card; click, `Enter`, and `Space` replace it in place with the Title field, focus the field, and select its complete value.
- [ ] Activating the Title neither selects nor Opens the Card, clicking elsewhere still selects it, the rail's Edit control still Opens it, and double-click is no longer an additional Title-editing convention.
- [ ] `F2`, valid `Enter` or blur completion, `Escape` cancellation, refusal feedback, and keyboard focus return retain their established behavior.
- [ ] Hover and focus visibly disclose the Title control without making it look like a form button or adding another pencil control.
- [ ] Stable component, catalogue, and application-level tests prove pointer, keyboard, accessibility, focus, and gesture-boundary behavior.
