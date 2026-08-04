# 03 — Edit target content through an Alias

**What to build:** When an author opens Edit on an Alias, resolve the Card that
owns the displayed content and edit that target through the same in-place
content editor, visibly preserving the Alias as delegation rather than exposing
its target as editable metadata.

**Blocked by:** 02 — Edit an opened Markdown Card.

**Status:** ready-for-agent

- [ ] Opening an Alias continues to show exactly the content its target would show without flattening or copying the Alias in the authored Space.
- [ ] Choosing Edit on an opened Alias resolves its single-hop target before selecting the content editor.
- [ ] The editor clearly identifies the target Card whose content will change while continuing to display the opened Alias context.
- [ ] The editor exposes the target Markdown Card's description and Markdown source through the same validation and draft lifecycle as direct editing.
- [ ] No Alias target, kind or Alias-description control appears in the opened editor.
- [ ] The Alias's own title remains editable only through the graph's inline title interaction.
- [ ] Completing the draft changes the target Card and leaves the Alias's id, title, description and target unchanged.
- [ ] The updated target content appears when opening the target and every Alias that shows it, with one source of truth and no copied body.
- [ ] Cancelling, completing an unchanged draft, or losing a valid target to replacement produces no Edit and no persistence submission.
- [ ] Space Authoring derives the target replacement from the current authoritative Space, validates the complete snapshot and submits exactly once.
- [ ] An Algorithmic View converts without visual movement on the first completed target Edit; a selected Layout updates in place.
- [ ] Conflict replacement closes any Alias-opened draft derived from the replaced Space.
- [ ] The resolved-content editor selection remains exhaustive by content kind; Alias delegates before selection and is not registered as a content editor.
- [ ] Domain and UI tests prove that Alias delegation edits the target while preserving the authored Alias and the single-hop reference rules.
- [ ] Playwright proves editing through an Alias updates the target and every occurrence, persists through the HTTP boundary and survives reload.
- [ ] `pnpm verify` and `pnpm e2e` pass.
