# 14 — Rename Layouts and Graphs from Space chrome

**What to build:** Make authored Layout and Graph names click-to-edit from the Space Sidebar, and make the selected authored Layout name editable from the Space View label in the canvas header.

**Blocked by:** 13 — Extract inline title editing for named Space chrome.

**Status:** resolved

- [x] Add the missing Layout rename completion to Space Authoring. It trims the submitted title, returns `unchanged` for the stored name, refuses a blank name with a stable field-local code, preserves Layout identity, positions and owned Graphs, and persists through the existing session lifecycle.
- [x] Wire Graph renaming through the existing `renamed-graph` completion and `graph-title-required` refusal. Do not add a second Graph rename path.
- [x] An authored Layout row in **Space View** exposes click-to-edit. `Flow` and `Grid` are computed Views and remain read-only.
- [x] A Graph row exposes click-to-edit while retaining its activation control and active-Graph colour.
- [x] The **Space View label** in the canvas header exposes the same Layout edit. It remains read-only while a computed View is selected.
- [x] One Layout edit is coordinated by Layout id across the Sidebar row and canvas header. They are two entry points into one draft and one completion, not independent editors that can disagree. Completing, cancelling, refusing or replacing the Space updates both surfaces coherently.
- [x] An inactive Sidebar row is activated by its ordinary row action before its title becomes editable. Once active, clicking the title edits it. The selected Layout in the canvas header is already active, so one click edits it.
- [x] The editor is withdrawn wherever authoring is already withdrawn, including presentation and a live conflicting edit. Mobile Sheet dismissal, React Flow keyboard isolation and persistence feedback retain their existing behaviour.
- [x] Application tests prove Layout and Graph renames persist and that both Layout entry points coordinate. Stable Ladle stories prove the Sidebar and header treatments, keyboard lifecycle and field-local refusals.

## Naming

The Sidebar section and product-facing header label are **Space View**. The existing component is currently named `SelectedCanvasRenderer`; renaming it to `SelectedSpaceView` is allowed in this ticket if done as a separate vocabulary-only change from the authoring implementation.

## Not in scope

Graph colour editing, renaming computed Views, creating or deleting Layouts or Graphs, or changing which Layout or Graph is active. Graph colour editing gets its own ticket because it uses a different control and completion interaction.

## Answer

Space Authoring now completes Layout renames with the same trim, unchanged and stable-refusal contract as Graph renaming. Active authored Layouts and Graphs edit from the Sidebar; the selected Layout also edits from the Space View header through one id-coordinated draft. Computed Views remain read-only, conflicting authoring withdraws the editor, and persistence plus Ladle parity evidence covers both names and both Layout entry points.
