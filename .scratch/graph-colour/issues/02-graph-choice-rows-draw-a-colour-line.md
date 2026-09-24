# 02 — Graph choice rows draw the Graph's colour as a line

Status: done

**What to build:** Every list that offers a choice of Graph — the Command Dock's Graph list and an Open Space Resource's Graph choice, both drawn by the shared `ChoiceMenu` — marks each row with a short coloured line in that Graph's colour instead of a coloured Graph glyph. The line is the one the canvas HUD's Graph key already draws (3×14, rounded), so a Graph looks the same in the list as in the key beside the Edges. Glyphs on every row were busy; the line is what a Graph's colour means on the canvas.

**Blocked by:** None (can start immediately).

Decided:
- **Rows only.** The Dock's own Graph identity keeps its coloured Graph glyph — there it says what *kind* of entity the colour belongs to, alongside the Space and Map glyphs — and so does the Colour… item.
- **No dimming.** The HUD dims non-active Graphs; a choice list marks the chosen row with its radio indicator, and dimming would only make the colours harder to compare.
- **One mark, not three copies.** Lift the HUD key's line into a `@project/ui` mark first and have the HUD and both lists draw it, resolving colour through the shared `graphColor` seam, so the three cannot drift apart. It is production UI: start from `$shadcn-first-ui`, and the new mark owes a design-system inventory entry and a story with both Ladle and application proof (ADR 0052).
- The Map list, which draws through the same `ChoiceMenu`, is unchanged.

- [x] The Dock's Graph list and an Open Space Resource's Graph choice draw a colour line per row, in that Graph's colour, and no Graph glyph
- [x] The HUD key draws the same shared mark, unchanged in appearance
- [x] The Dock's Graph identity and the Colour… item still draw the coloured Graph glyph
- [x] Inventory entry, story and its Ladle and application proofs; `pnpm ui:catalog:check`, `pnpm e2e` and `pnpm e2e:ladle` green

Built as `GraphColorLine` (`packages/ui/src/GraphColorLine.tsx`), which takes a colour each caller resolves through `graphColor`; an Open Space Resource's target now carries each Graph's resolved colour. No `uncataloguedComponents` entry was added: the mark is rendered by stable stories (the Graph HUD, the Command Dock and the embedded Space Resource), and `pnpm ui:catalog:check` refuses an entry for a module a stable story renders. The evidence is two parity claims, `graph-choice-rows-draw-the-graph-colour-line` and `open-space-resource-graph-rows-draw-the-graph-colour-line`, each with a Ladle and an application test.
