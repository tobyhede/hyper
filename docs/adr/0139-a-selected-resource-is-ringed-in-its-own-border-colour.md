# A selected Resource is ringed in its own border colour

Status: accepted
Refines: 0135
Related: 0121

ADR 0135 kept the selection ring in ink so that selection would read the same on every Resource. In the sand theme the ink is near-black, so a selected Resource in no Graph showed a black border made thicker, while a selected Resource in a Graph showed a black ring around a coloured border. The dark theme's ink is a neutral grey, the colour of a Resource in no Graph, and the theme ringed selection in its chrome's magenta instead. That broke 0135, and it put the magenta out of reach of every Graph colour, because a Graph drawn in it would look selected.

## The decision

- **The selection ring is the Resource's border drawn again outside it, in the border's colour.** A selected Resource in a Graph carries a double-width border in that Graph's colour, and a selected Resource in no Graph carries a double-width border in ink. A Shape's ring follows its outline in the same colour (ADR 0121).
- **This holds in every theme.** No theme draws the ring in a colour of its own.
- **Selection is told by the double border and the anchor handles**, which a selected Resource shows and a resting one does not.
- **The drag shadow and the resize marks stay ink**, as ADR 0135 decided.

## Why

- **It is what the sand theme already showed** for a Resource in no Graph: the ink border, thicker. Every Resource now reads that way.
- **No colour is reserved for selection**, so every theme's Graph colours may use its whole palette, the dark theme's magenta included.

## Rejected

- **The ink ring around a coloured border** (ADR 0135 as written). In the dark theme it is the no-Graph grey, so it reads as a second, unrelated border.
- **A theme colour for selection**, the dark theme's magenta. It takes a colour away from the Graphs, and selection would look different in each theme.

## Cost accepted

- **Selection is told by weight rather than by a contrasting colour.** The double border and the anchor handles carry it.
