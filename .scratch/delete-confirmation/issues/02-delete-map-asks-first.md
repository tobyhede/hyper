# 02: Delete Map asks first

**What to build:** Delete Map in the Dock's Map menu opens the delete confirmation instead of running at once. It asks `Delete {Map} From Space?` and says that the Map, its Graphs and their Edges are permanently deleted and that its Resources stay in the Space. Delete runs the existing Map deletion; Cancel and Escape run nothing and return focus to where Delete Map was pressed.

**Blocked by:** 01 — One delete confirmation for every kind of subject

**Status:** ready-for-agent

- [ ] Delete Map asks before it runs, with the title and description above, naming the Map by its short name.
- [ ] Delete runs the existing deletion and the canvas continues on the surviving Map as today; a refusal still reports.
- [ ] Cancel and Escape leave the Map in place.
- [ ] Delete Map is still withheld for a Space's last Map.
- [ ] Existing Delete Map journeys pass through the confirmation.
