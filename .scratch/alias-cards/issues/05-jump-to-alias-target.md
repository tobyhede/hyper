# Jump from an Open Alias to its Target Card

Status: needs-info
Type: follow-up

## Context

An Open Alias renders its Target Card's content read-only. The Alias still participates normally in Card and Layout authoring: its own Title, placement, Graph Edges, Open/Closed state and Open Size remain authorable. What the Alias must not author is its immutable Target or the content and content configuration the Target owns.

Authors will eventually need a direct route from an Open Alias to the Card that owns the content they are viewing. Two controls are candidates:

- **Jump to Target Card** — navigate to and focus or open the Target Card.
- **Edit Target** — navigate to the Target Card and enter the appropriate content-authoring interaction.

Neither belongs in the initial read-only Open Alias work. Both require a settled URL-addressability model for Cards so navigation, reload, history, deep linking and unavailable Targets have one coherent meaning instead of a canvas-local shortcut.

## Blocked by

Implementation of ADR 0069's Card URL addressability, including the behavior when the addressed Card is outside the current Layout or otherwise unavailable on the current canvas.

## Questions to settle

- What URL identifies a Card within a Space?
- Does Jump preserve the current Layout, select another Layout containing the Target, or choose a computed View?
- Does Jump merely select/focus the Target, or Open it as part of navigation?
- Is **Edit Target** a distinct control, or is Jump followed by the Target Card's ordinary Edit action sufficient?
- How do browser Back and Forward restore the Alias and Target contexts?
- What refusal or recovery is shown when the Target is valid in the Space but unavailable in the chosen canvas renderer?
- How does a Jump behave when the Target is a Space Card?

## Acceptance criteria

- [ ] Card URL addressability is decided and implemented before this issue becomes ready for implementation.
- [ ] An Open Alias offers **Jump to Target Card** using normal application navigation rather than a private canvas-only path.
- [ ] Browser history, reload and direct navigation reproduce the addressed Card context.
- [ ] The control works for Aliases targeting Markdown Cards and Space Cards.
- [ ] The Alias remains read-only: Jump does not retarget it or author Target content in place.
- [ ] If **Edit Target** is retained, it reuses the Target Card's ordinary authoring interaction after navigation rather than introducing an Alias-specific editor.
- [ ] Keyboard names, focus continuation and unavailable-Target behavior are covered by browser tests.
