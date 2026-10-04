# A Shape is a Map's, and only a Closed Resource draws it

Status: accepted
Refines: 0113
Related: 0064, 0066, 0084, 0086, 0093, 0110, 0112, 0114

ADR 0113 gave the author the Ur Resource so they can diagram: draw named things and the Edges between them. A diagram also needs notation. A decision reads as a diamond and a start or end reads as a pill, so a Resource needs a way to be drawn in something other than the rectangle every front has now.

A Resource on a Map has a **Shape**: the outline its Closed front is drawn in. The set is closed: **rectangle**, **pill**, **ellipse**, **diamond** and **hexagon**.

**The Shape is the Map's.** It is stored in the Map's entry for the Resource, beside position, Open/Closed state and Open Size. It is not stored on the Resource. A Shape is notation, and notation belongs to the diagram. The same Resource can be a decision in one Map and a step in another. A Resource is a Title and a kind, and the kind owns everything else. A presentation field on the Resource would be the shared second slot the model rules out.

**Every kind may take any Shape.** ADR 0113 says a kind adds actions its content supports and takes none away. Nothing about a Shape depends on content, so tying it to the Ur kind would break that rule.

**The Shape is required, and a Resource added to a Map is given the rectangle.** Add Resource and Add to Map write the rectangle, as a new Graph is given the arrow head shape. There is no rule that reads a missing Shape as a rectangle. The schema and fixtures roll forward in the same change (ADR 0054, ADR 0056). Remove from Map forgets the Shape along with the rest of the entry.

**The Shape is drawn inside the fixed Closed Size and changes no rect.** Every Closed Resource keeps the same Closed Size. Displacement (ADR 0084, ADR 0093) and Edge attachment (ADR 0110) read the rect and are unchanged. That is why the set is closed. Every member touches the midpoint of each side of its bounding rect, where Edges attach, so an Edge meets the drawn outline. A triangle, parallelogram, cylinder or cloud would not, and is excluded. The Title Lines and kind glyph sit in the rectangle inscribed in the Shape and are truncated as they are now. The selection ring and a Reference Resource's dotted border follow the outline.

**Only a Closed Resource draws its Shape.** An Open Resource and a presented Resource are always rectangles. They are read, not diagrammed, and an Open Markdown body or image inside a diamond would lose its corners and its resize control. The Shape stays recorded while the Resource is Open and returns when it Closes.

**The author changes it through a Shape choice in the Resource's Actions menu**, drawn with `ChoiceMenu`. Each choice is one undoable Edit. The choice is offered while the Resource is Open too, so the menu doesn't change between states.

An embedded Map draws its Resources' Shapes, because one surface draws every Map (ADR 0112). An automatic arrangement (ADR 0086) moves positions and keeps every Shape. Whether a strategy may assign Shapes is a separate, later decision.

## Considered options

- **The Shape belongs to the Resource.** It would look the same in every Map. Rejected: notation is the diagram's, and a field on the Resource would add the shared slot the model rules out.
- **The Shape belongs to the kind.** Rejected under ADR 0113: it would give a kind something no content asks for and keep it from the others.
- **A Shape changes the Closed Size**, for example a square for a circle. Rejected: displacement, Edge attachment and the fixed Closed Size would all have to depend on the Shape, for a difference an ellipse in the same rect already shows.
- **Open Resources draw their Shape too.** Rejected: content needs the rectangle, and the resize control needs a corner.
- **An open set**, such as a free corner radius or an arbitrary path. Rejected: Edges could no longer be guaranteed to meet the outline, and the set would stop being notation a reader can learn.
- **A missing Shape reads as a rectangle.** Rejected: the repo is the only source of state, so the schema and fixtures move forward together instead of carrying a rule for reading a missing field.

## Consequences

The Map entry schema, intake, export and import gain a required `shape` field. Every tracked fixture and seed writes `rectangle`. Add Resource and Add to Map write it. A new Edit changes one Resource's Shape on one Map. The Closed Resource front draws the outline, insets its Title and glyph, and has its selection ring and Reference border follow the outline. The Open, presented and editing fronts are unchanged.
