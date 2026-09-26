# 03: The mark beside each Graph title ends in its head shape

**What to build:** The mark that pairs a Graph's title with its appearance becomes a miniature Edge: a short line in the Graph's colour ending in its head shape (ADR 0105). This applies everywhere a list names every Graph — the overview legend, the Command Dock's Graph choices and an Open Space Resource's Graph choices — so a viewer can match a receding Edge's shape to its Graph without colour. The Active Graph's icon is not the legend and keeps its present form.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] The overview legend's mark for each Graph ends in that Graph's head shape.
- [ ] The Dock's Graph choice rows and an Open Space Resource's Graph choices draw the same mark.
- [ ] A Graph with no stored head shape shows `arrow`.
- [ ] The mark reads the Graph's head shape from the Space, so a changed head shape redraws it in every list (proved against fixtures with differing head shapes).
- [ ] Existing stories showing the mark are updated, with Ladle and application proof.
