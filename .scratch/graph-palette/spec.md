# Expanded Graph palette

Replace the six-slot `GRAPH_PALETTE` with **Tableau 20** — twenty curated,
colorblind-conscious categorical colours (light/dark pairs) suited to multi-series
graphs on a white canvas.

Authors choose Graph colour from a **palette-bound swatch grid** in a popover
opened from the Graph menu's **Colour…** row. There is no free-form hex picker;
the schema still accepts any stored CSS colour, but the product offers exactly
the palette slots.

**Out of scope:** Fnz11/shadcn-color-picker and continuous RGBA picking.

**Migration:** None beyond fixtures and tests — no production Spaces exist.

**Source:** Tableau 10/20 categorical palettes (Tableau blog, palettable reference).
