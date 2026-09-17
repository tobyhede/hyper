# 01 — Open a Space Thing to the selected Diagram’s bounds

**What to build:** Opening a Space Thing that has no remembered Open Size expands
it so the selected Diagram is fully visible — the bounding box of the Things on
that Diagram, plus the embed inset — rather than the fixed 960×720 first-open
size. An empty Diagram opens at the existing Space Thing minimum. Neighbours
move by that growth. A remembered Resize still wins on later Opens (ADR 0066).
Adding Things to the target while the Space Thing stays Open does not grow it;
those Things clip until a later Open that has no remembered size, or until the
author Resizes.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] First Open of a Space Thing with no remembered Open Size uses the bounds of
      the Things on its **selected** Diagram, plus the embed inset, and is never
      smaller than the existing Space Thing minimum.
- [ ] An empty selected Diagram opens at that minimum.
- [ ] A newly created target (one closed Thing at the origin) opens near that
      minimum, not at 960×720.
- [ ] A Diagram whose Things do not fit in 960×720 opens large enough that every
      placed Thing is fully visible inside the embed, not clipped.
- [ ] Neighbours beyond the Space Thing take the growth of that Open Size
      (ADR 0084).
- [ ] After the author Resizes, Close then Open restores that remembered Open
      Size even if the target Diagram has since grown (ADR 0066).
- [ ] Live growth while the Space Thing stays Open is out of scope: the embed
      keeps clipping Things that no longer fit (ADR 0068).
