# 03: An Open Ur Resource draws its Shape

**What to build:** an author Opens or resizes an Ur Resource and it stays in its Shape at its Open Size, with its Title and kind glyph inside the outline, its selection ring following the outline, and its short Title shown for any Shape but the rectangle. Close returns it to its Shape at the Closed Size, and resizing back into the magnetic range Closes it as any Resource does. Open, Close, Resize and displacement are otherwise unchanged. `shape` is declared once beside position in the Map entry's schema, outside the Open/Closed union, with the stored JSON unchanged. The rule that drew the rectangle for any display but Closed, and the stylesheet's redundant Closed check, are removed.

**Blocked by:** 01, 02.

**Status:** ready-for-agent

- [ ] The Map entry schema declares `shape` on its base; the Open/Closed union carries only `open` and `openSize`; fixtures and seeds are byte-identical.
- [ ] The front draws its Shape from `shape` alone; its rendering test asserts the drawn Shape attribute for Open and Closed displays.
- [ ] Application E2E: an Ur Resource in each non-rectangle Shape, Opened and resized, draws its Shape and holds its Title and glyph inside it; Close returns it to the Closed Shape; an embedded Map draws an Open Ur Resource's Shape.
- [ ] Ladle stories carry Open specimens for each Shape, and `closed-resource-draws-its-shape` and `closed-resource-treatments-follow-its-shape` are renamed without "closed", each with its Ladle and application proof.
- [ ] ADR 0117 (title included), the Maps and Graphs contract R48 and R49, and CONTEXT.md "Shape" are fixed in place to define the Shape without reference to Open.
