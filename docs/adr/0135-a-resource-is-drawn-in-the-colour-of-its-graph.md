# A Resource is drawn in the colour of its Graph, and recedes outside the Active Graph

Status: accepted
Refines: 0041
Refined by: 0139
Related: 0028, 0040, 0112, 0129

Activating a Graph is emphasis, not filtering (`maps-and-graphs.md` R29). Until now the emphasis was on the Edges alone: another Graph's Edges recede and the HUD dims its key, while every Resource kept the same ink border and full strength. A reader could not see from a Resource which Graph it belongs to, or whether the Active Graph reaches it.

## The decision

- **A Resource is in a Graph when it is an endpoint of one of that Graph's Edges**, as `graphResourceIds` answers. Map membership alone is not Graph membership.
- **A Resource's border is the colour of its Graph.** A Resource in the Active Graph is drawn in the Active Graph's colour. Any other Resource is drawn in the colour of the first Graph, in the Map's authored order, that it is in. A Resource in no Graph keeps the ink border.
- **A Resource not in the Active Graph recedes.** Its face stays solid, so nothing behind it shows through, while its border is mixed halfway towards the face and its Title, rail and content are drawn at half opacity, which matches the HUD's dimmed Graphs. It returns to full strength while hovered, focused, selected, being edited or offered as the end of a connection, and it stays fully interactive: it can still be selected, opened, edited, dragged and connected.
- **Nothing recedes while the Active Graph has no Edges.** Add Graph activates the empty Graph it creates (R26), and a Map that went dim on that gesture would hide the Resources the author is about to connect.
- **The border and a Shape's outline take the colour, and nothing else does.** The drop shadow, the selection ring and the resize marks stay ink, so selection reads the same on every Resource. The anchor handles and the title underline stay the Active Graph's colour on every Resource, receding ones included, because an Edge drawn from a handle joins the Active Graph.
- **A change of Active Graph fades.** Opacity and border colour transition over the Resource's existing hover timing (`--resource-hover-duration`), with no new timing.
- **Every drawn Map follows the rule by its own Active Graph** (ADR 0112), a Map inside an Open Space Resource included. The presenting Stage draws one Resource and is unchanged.

## Why

- **Emphasis reaches the thing being read.** A talk is read Resource by Resource, and the Active Graph's line is the narrative; the Resources off it are the ones a reader should look past.
- **The first Graph, not the Map's first.** Colouring every receding Resource with the Map's first Graph would give them all one colour and say nothing. The first Graph a Resource is in says where it belongs, from an order the author already controls.

## Rejected

- **Hiding Resources outside the Active Graph.** That is filtering, which R29 refuses.
- **Dimming on an empty Active Graph.** It dims the whole Map on Add Graph.
- **Colouring the selection ring and shadow.** Selection would read differently on each Graph.
- **The whole Resource at half opacity.** Edges behind it showed through its face.
- **Fading only the border.** The Title and content would stay at full contrast, and the Resource would barely recede.

## Cost accepted

- **Light palette colours draw a faint border** against the Resource's face. The author chose the colour, and the 4px border carries it.
- **A receding Resource's text is below AA contrast** until it is hovered, focused or selected. Receding is the point, and any of those brings it back.
- **A Presentation Notes Resource recedes whenever the talk Graph is active** (ADR 0129). It is in no other Graph, so this is the rule working, and there is no special case.
