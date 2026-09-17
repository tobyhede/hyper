# 01 — Open a Space Thing to the selected Diagram’s bounds

**What to build:** Opening a Space Thing that has no remembered Open Size expands
it so the selected Diagram is fully visible — the bounding box of the Things on
that Diagram, plus the embed inset — rather than the fixed 960×720 first-open
size. An empty Diagram opens at the existing Space Thing minimum. Neighbours
move by that growth. A remembered Resize still wins on later Opens (ADR 0066).
Adding Things to the target while the Space Thing stays Open does not grow it;
those Things clip until the author Resizes, or until a later Open of a Space
Thing that still has no `openSize`.

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
- [ ] **`authored.openSize` contract.** An Open Space Thing always has
      `openSize` (intake). Opening with no remembered size writes the
      bounds-based size into `authored.openSize` as part of the Open Edit —
      the same First Open recording ADR 0066 already requires of every kind.
      Close preserves it. A later Open therefore uses that recorded size
      rather than refitting, even if the target Diagram has grown. Actions
      that write `authored.openSize`: First Open (bounds or the Space Thing
      minimum), author Resize, and ticket 02's Diagram-choice Edit. Magnetic
      Close to Closed Size records Closed and does not replace the remembered
      Open Size (ADR 0066). The post-growth refit path is author Resize or
      changing the selected Diagram (ticket 02), not a Close then Open of a
      size First Open already recorded.
