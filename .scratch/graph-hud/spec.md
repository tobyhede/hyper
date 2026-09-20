# The canvas HUD says what it is a key to

The canvas HUD (`GraphHud`) draws a Graph key over a minimap, bottom-right of
the canvas. It names each Graph in its own colour and marks the Active one, and
says nothing about what those Graphs belong to — so with several Spaces open a
reader can read the key perfectly and still not know where they are standing.

Three tickets, from a prototype on branch `space-structure-hud`
(`Review/HUD Space and Diagram`, plus four rejected variants in its history):

1. The minimap draws the Diagram to scale. It has never worked: React Flow sizes
   a MiniMap only through numeric `style.width`/`style.height`, the HUD passes
   `'100%'`, and the resulting `NaN` viewBox draws one Thing over the whole box.
2. The stable story keys the open Diagram's Graphs, which is what the
   application has always drawn and what the fixture does not.
3. The HUD names the Space and the Diagram above the key.

**No ADR.** `docs/agents/workflow.md` puts visual treatment, layout and control
placement outside what an ADR records, and none of this is hard to reverse,
surprising, or a trade-off against a credible rejected alternative. The rejected
prototype variants are recorded in ticket 03 instead, which is where a future
reviewer will look before suggesting them again.
