# 03 — Wire Graph colour picker on the Command Dock

Status: resolved
Tags: release/v1

**What to build:** Replace the Graph menu's Colour **radio submenu** with a
**Colour…** row that opens the palette colour picker (ticket 02) bound to
Tableau 20 (ticket 01). Selecting a swatch completes `recolored-graph` for the
active Graph and persists through the normal authoring path; refusals still
surface through the existing Graph notice. The picker is palette-bound only —
no hex field, no custom colours.

**Blocked by:** 01 — Adopt Tableau 20 as the Graph palette; 02 — Palette colour picker component.

- [x] The Graph identity menu offers **Colour…** instead of an inline radio list of every slot.
- [x] The picker lists all twenty Tableau slots with the shared labels from ticket 01.
- [x] Recolour on the active Graph persists and the Dock glyph, Present control, and canvas edges/handles agree on the new colour.
- [x] Entity-edit withdrawal rules unchanged: recolour unavailable while authoring is withdrawn, same as today.
- [x] `pnpm verify` passes.

## Comments

Resolved on `main` by `b9fe0a0cf` (adopt Tableau 20 and the swatch grid), `47c0f8fce` (picker layout and palette ordering) and `ed18178ae` (parity claims and swatch grid tests).
