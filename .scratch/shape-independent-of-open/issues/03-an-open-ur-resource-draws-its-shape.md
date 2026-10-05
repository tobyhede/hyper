# 03: An Open Ur Resource draws its Shape

**What to build:** an author Opens or resizes an Ur Resource and it stays in its Shape at its Open Size, with its Title and kind glyph inside the outline, its selection ring following the outline, and its short Title shown for any Shape but the rectangle. Close returns it to its Shape at the Closed Size, and resizing back into the magnetic range Closes it as any Resource does. Open, Close, Resize and displacement are otherwise unchanged. `shape` is declared once beside position in the Map entry's schema, outside the Open/Closed union, with the stored JSON unchanged. The rule that drew the rectangle for any display but Closed, and the stylesheet's redundant Closed check, are removed.

**Blocked by:** 01, 02.

**Status:** resolved

- [x] The Map entry schema declares `shape` on its base; the Open/Closed union carries only `open` and `openSize`; fixtures and seeds are byte-identical.
- [x] The front draws its Shape from `shape` alone; its rendering test asserts the drawn Shape attribute for Open and Closed displays.
- [x] Application E2E: an Ur Resource in each non-rectangle Shape, Opened and resized, draws its Shape and holds its Title and glyph inside it; Close returns it to the Closed Shape; an embedded Map draws an Open Ur Resource's Shape.
- [x] Ladle stories carry Open specimens for each Shape, and `closed-resource-draws-its-shape` and `closed-resource-treatments-follow-its-shape` are renamed without "closed" (now `ur-resource-draws-its-shape` and `ur-resource-treatments-follow-its-shape`), each with its Ladle and application proof.
- [x] ADR 0121 (title included), the Maps and Graphs contract R48 and R49, and CONTEXT.md "Shape" are fixed in place to define the Shape without reference to Open.

**Resolution:** `shape` is declared once on the Map entry's base (`shapedPositionSchema`), and the Open/Closed union carries only `open` and `openSize`; no fixture or seed changed. A parsed entry now lists `shape` after the position rather than last, which reorders keys only in JSON the code writes afresh. `drawnResourceShape` is gone: `CanvasResource` draws `shape` directly, the stylesheet's body rule no longer reads `data-open`, and a Resource drawn in a Shape keeps its kind glyph Open, since it has no content area to say what it is (an Open rectangle still draws its Title alone). The application E2E Opens and resizes an Ur Resource in each Shape, Closes it back, and Closes an Open diamond by resizing into the magnetic range; the embedded-Map test Opens its Ur Resource. The Edge-to-diamond test had been loosened because the canvas chooses attachment sides from the two rects' geometry (ADR 0087), not from the handle the gesture began on, and U sat further right of T than below it; it now places U directly below T and asserts the exact top midpoint. ADR 0121 is renamed to `0121-a-shape-is-a-maps-and-an-ur-resource-draws-it-open-and-closed.md`.
