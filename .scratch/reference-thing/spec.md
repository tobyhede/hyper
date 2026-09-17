# Reference Thing

Source: grilling 2026-09-17. ADR 0092. Glossary updated in the same session.

## Current direction — ADR 0092

The Thing that was **Alias** is **Reference Thing**: a reference to a Target
Thing, and a read-only view of that Target when Open. Behavior is unchanged
(ADR 0009, ADR 0070, ADR 0089). Alias is the retired word.

Settled in the grill — do not re-litigate:

- Same concept as Alias. Jump to Target is a feature of this Thing, not a
  separate concept; it stays deferred (`.scratch/alias-cards/issues/05`).
- Parallel, not a family. A Space Thing is a reference to a Space. A Reference
  Thing is a reference to a Thing. There is no Reference supertype.
- Targets: Markdown Thing or Space Thing. Not itself. Not another Reference
  Thing. Single-hop.
- Menu: **Create Reference**. Kind name: **Reference Thing**. Qualified:
  **Reference to a Markdown Thing** / **Reference to a Space Thing**.
- Full domain rename, `kind: 'reference'`, format rolls forward (ADR 0054).
  `SpaceReferenceError` and `validateReferences` keep their names.
- **Copy link to Target** is a Thing-menu command that copies the Target's
  canonical Thing URL. Separate ticket from the rename.
- Jump remains deferred. Highlight-on-select is optional later chrome, not the
  kind.

## Issues

- `01-rename-alias-to-reference-thing` — the rename. Runs alone.
- `02-copy-link-to-target` — the menu command. Not inside the rename.
