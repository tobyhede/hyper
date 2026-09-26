# 02: An author changes a Graph's head shape

**What to build:** The Graph menu gains **Shape…** directly under **Colour…** (ADR 0105). It opens a grid of the four head shapes, the same size as the colour swatches and drawn in the Graph's colour; its trigger shows the Graph's current head shape. Choosing one completes an Edit beside recolour; choosing the shape the Graph already has is `unchanged`. The menu is the shared Graph menu, so Shape… appears wherever that menu is drawn — the Command Dock and an Open Space Resource's Graph choices — and follows the same availability as Colour…. Starts with `$shadcn-first-ui`.

**Blocked by:** 01

**Status:** done

- [x] Shape… sits directly under Colour… in the Graph menu, disabled whenever Colour… is.
- [x] The submenu offers exactly the four shapes, sized like the colour swatches, in the Graph's colour, with the current one marked.
- [x] Choosing a different shape is one Edit, and the canvas redraws the Graph's Edges with it.
- [x] Choosing the current shape produces no Edit (`unchanged`).
- [x] The Open Space Resource's Graph menu offers Shape… and it changes the target Space's Graph, as recolour does there.
- [x] Ladle story and application proof for the submenu (ADR 0052); `pnpm ui:catalog:check` passes.
