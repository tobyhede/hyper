# 04: Add Resource and Rename are Canvas commands

**What to build:** `C` becomes `canvas.addResource` (aim *canvas*, serves *any* occurrence: the Map holding the selection, otherwise the canvas's own Map). F2 becomes `canvas.renameResource` (aim *selection*, serves *any* occurrence). Both are answered by the dispatcher, and their window listeners and their own Full View checks are removed. Behaviour is unchanged: `C` still reaches the canvas from the Dock, and neither key acts while authoring is withdrawn or a body is being edited.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] Command-level tests cover availability for both commands: authoring withdrawn, body editing, Full View shown, an embedded occurrence.
- [ ] The existing `C` and F2 key tests pass unchanged.
- [ ] `C` typed into a text field, a menu or a dialog is left alone.
