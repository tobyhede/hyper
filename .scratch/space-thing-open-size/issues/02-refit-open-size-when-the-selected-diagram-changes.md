# 02 — Refit Open Size when the selected Diagram changes

**What to build:** Choosing a different Diagram on an already-Open Space Thing
grows or shrinks that Thing to the newly selected Diagram’s bounds so the new
Diagram is fully visible, and moves neighbours by the difference. This is an
Open Size Edit on the containing Diagram, not a live layout of the embed.

**Blocked by:** 01 — Open a Space Thing to the selected Diagram’s bounds.

**Status:** ready-for-agent

- [ ] Changing the Diagram choice on an Open Space Thing sets Open Size from that
      Diagram’s Thing bounds plus the embed inset, floored at the Space Thing
      minimum.
- [ ] Every placed Thing on the newly selected Diagram is fully visible inside
      the embed after the choice lands.
- [ ] Neighbours beyond the Space Thing take the difference in growth
      (ADR 0084).
- [ ] The new Open Size is the remembered size: Close then Open keeps it
      (ADR 0066).
- [ ] Changing Graph alone does not change Open Size.
