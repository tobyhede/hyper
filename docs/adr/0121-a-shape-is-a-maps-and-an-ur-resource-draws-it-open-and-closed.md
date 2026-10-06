# A Shape is a Map's, and an Ur Resource draws it Open and Closed alike

Status: accepted
Refines: 0113
Refined by: 0122
Related: 0064, 0066, 0084, 0093, 0105, 0110, 0112, 0114

ADR 0113 gave the author the Ur Resource so they can diagram: draw named things and the Edges between them. A diagram also needs notation. A decision reads as a diamond and a start or end reads as a pill, so a Resource needs a way to be drawn in something other than the rectangle every front has now.

A Resource on a Map has a **Shape**: the outline its front is drawn in, Open or Closed. The set is closed: **rectangle**, **pill**, **ellipse** and **diamond**.

**The Shape is the Map's.** It is stored in the Map's entry for the Resource, beside position, Open/Closed state and Open Size. It is not stored on the Resource. A Shape is notation, and notation belongs to the diagram. The same Resource can be a decision in one Map and a step in another. A Resource is a Title and a kind, and the kind owns everything else. A presentation field on the Resource would be the shared second slot the model rules out.

**Only an Ur Resource takes a Shape.** A Shape is diagram notation, and the Ur Resource is the kind a diagram is drawn with: it has no content, so its outline is all a reader sees of it. A Markdown document, a picture or an embedded Map in a diamond is notation nobody needs, and offering it would clutter every Resource's rail. Every other kind is the rectangle. A Shape is the Ur kind's, so ADR 0113's rule that a kind adds what its content supports and takes nothing away from the others is unaffected. A Shape Edit on any other kind is refused, and intake refuses a stored Map entry giving any other kind a Shape but the rectangle.

**The Shape is optional, and the application's default is the rectangle.** An entry with no Shape stored draws as the rectangle, as a Graph with no head shape stored draws the arrow (ADR 0105). Add Resource and Add to Map write no Shape, so every entry that never had one chosen, and every tracked fixture and seed, stays as it was. Choosing a Shape writes the one chosen, the rectangle included, and choosing the Shape the Resource already draws as changes nothing. `rectangle` is a legal stored value on every kind. Remove from Map forgets the Shape along with the rest of the entry.

**The Shape is drawn at the Resource's rect and changes no rect.** A Closed Resource is its Shape at the fixed Closed Size, and an Open one is its Shape at its Open Size. Open, Close, Resize, Open Size and displacement (ADR 0064, ADR 0066, ADR 0084, ADR 0093) and Edge attachment (ADR 0110) read the rect and are unchanged. Ellipse and diamond fill the rect proportionally; a pill's ends stay half-circles at any size. That is why the set is closed. Every member touches the midpoint of each side of its bounding rect at every size, where Edges attach, so an Edge meets the drawn outline. A triangle, parallelogram, cylinder or cloud would not, and is excluded. The Title sits centred in the rectangle inscribed in the Shape, and a Shape other than the rectangle shows the short Title: the name on one line, with an ellipsis when more Title Lines follow. The selection ring follows the outline.

**An Ur Resource draws no kind glyph, in any Shape, Open or Closed.** Its Shape says what it is: an outline with nothing in it but a name is an Ur Resource, and a glyph naming the kind beside it says the same thing twice. Every other kind keeps its glyph, because the rectangle it is drawn in is every kind's.

**A Shape is drawn Open and Closed alike.** Open/Closed is the Map's, and it has nothing to do with the Shape: an author who Opens a diamond to make it bigger gets a bigger diamond, and Close returns it to the diamond at the Closed Size. Only an Ur Resource takes a Shape, and an Ur Resource has no content, so nothing an Open Resource reads is ever drawn inside an outline. The resize control stays at the rect's bottom-right corner. A presented Resource is drawn by the presented surface, not on the Map, and is always the rectangle.

**The author changes it through a Shape choice on the Resource's rail**, drawn with `ChoiceMenu`: a control whose face is the Shape the Resource is drawn in, opening the four Shapes, each drawn and named. Each choice is one Edit. The choice is offered Open and Closed, so the rail doesn't change between states.

An embedded Map draws its Ur Resources' Shapes, Open or Closed, because one surface draws every Map (ADR 0112).

## Considered options

- **The Shape belongs to the Resource.** It would look the same in every Map. Rejected: notation is the diagram's, and a field on the Resource would add the shared slot the model rules out.
- **Every kind may take any Shape.** Rejected: a Markdown, Image, Space or Reference Resource in a Shape is notation nobody needs, and the choice would clutter every Resource's rail.
- **A Shape fixed by kind.** Rejected: an Ur Resource is a decision in one diagram and a step in another, so its Shape is chosen per Map rather than given by its kind.
- **A Shape changes the Closed Size**, for example a square for a circle. Rejected: displacement, Edge attachment and the fixed Closed Size would all have to depend on the Shape, for a difference an ellipse in the same rect already shows.
- **Only a Closed Resource draws its Shape.** Rejected: a diagram could not hold a large diamond, an ellipse sized to its label or a pill stretched across a lane, and Opening would change the notation. The reason first given for it — that content needs the rectangle — no longer applies once only the contentless Ur Resource takes a Shape.
- **A hexagon in the set.** It meets the side-midpoint rule, and was dropped from the set during the build. No reason was recorded for dropping it.
- **An open set**, such as a free corner radius or an arbitrary path. Rejected: Edges could no longer be guaranteed to meet the outline, and the set would stop being notation a reader can learn.
- **The Shape is required on every entry, and Add writes the rectangle.** Rejected: a field is optional and the application chooses its default, as `headShape` is (ADR 0105). Requiring it would put notation only an Ur Resource uses on every entry of every kind, in every fixture, seed and hand-written file.

## Consequences

The Map entry schema, intake, export and import gain an optional `shape` field, absent meaning the rectangle; one resolver in `@project/core` answers the Shape an entry draws as. Tracked fixtures and seeds are unchanged, and Add Resource and Add to Map write no Shape. A new Edit changes one Resource's Shape on one Map. The Resource front draws the outline at its current rect, Open or Closed, insets its Title, and has its selection ring follow the outline. An Ur Resource draws no kind glyph, so its Title is centred in its rect, or the rectangle inscribed in its Shape. A Resource in a Shape other than the rectangle shows its short Title at every size: its name on one line, with an ellipsis when more Title Lines follow. The presented Resource is unchanged.
