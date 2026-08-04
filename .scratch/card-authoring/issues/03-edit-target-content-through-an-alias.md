# 03 — Edit target content through an Alias

**What to build:** When an author opens an Alias, resolve the Card that
owns the displayed content and edit that target through the same in-place
content editor, visibly preserving the Alias as delegation rather than exposing
its target as editable metadata.

**Blocked by:** 02 — Edit an opened Markdown Card.

**Status:** resolved

- [x] Opening an Alias continues to show exactly the content its target would show without flattening or copying the Alias in the authored Space.
- [x] Opening an Alias resolves its single-hop target before selecting the content editor.
- [x] The editor clearly identifies the target Card whose content will change while continuing to display the opened Alias context.
- [x] The editor exposes the target Markdown Card's description and Markdown source through the same validation and draft lifecycle as direct editing.
- [x] No Alias target, kind or Alias-description control appears in the opened editor.
- [x] The Alias's own title remains editable only through the graph's inline title interaction.
- [x] Completing the draft changes the target Card and leaves the Alias's id, title, description and target unchanged.
- [x] The updated target content appears when opening the target and every Alias that shows it, with one source of truth and no copied body.
- [x] Cancelling, completing an unchanged draft, or losing a valid target to replacement produces no Edit and no persistence submission.
- [x] Space Authoring derives the target replacement from the current authoritative Space, validates the complete snapshot and submits exactly once.
- [x] An Algorithmic View converts without visual movement on the first completed target Edit; a selected Layout updates in place.
- [x] Conflict replacement closes any Alias-opened draft derived from the replaced Space.
- [x] The resolved-content editor selection remains exhaustive by content kind; Alias delegates before selection and is not registered as a content editor.
- [x] Domain and UI tests prove that Alias delegation edits the target while preserving the authored Alias and the single-hop reference rules.
- [x] Playwright proves editing through an Alias updates the target and every occurrence, persists through the HTTP boundary and survives reload.
- [x] `pnpm verify` and `pnpm e2e` pass.

## Answer

Implemented in `ada7485`. Opening an Alias preserves it as the visible context,
resolves its single-hop Markdown target before exhaustive editor selection and
completes the target Card through Space Authoring without exposing or changing
Alias metadata. The shared content remains one source of truth across the target,
every Alias and browser reload. Verification passed with all 744 tests in
`pnpm verify` and all 66 tests in `pnpm e2e`.

The decision itself is ADR 0038, which refines 0037. ADR 0037's own record — that
an alias could not be opened, and what that cost — stands as it was accepted.
