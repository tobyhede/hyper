# Shape independent of Open

Status: ready-for-agent

Refines `.scratch/resource-shape/` (ADR 0117, PR 338) in place. ADR 0117 is not on `main`, so it is corrected rather than superseded.

## Problem Statement

An author diagramming with Ur Resources gives one a Shape, a diamond for a decision, and then Opens it to make it bigger. The diamond disappears: an Open Resource is always drawn as a rectangle, and the Shape only comes back on Close. A diagram cannot hold a large diamond, an ellipse sized to its label, or a pill stretched across a lane.

The Shape is also offered on every kind. A Markdown document, a picture or an embedded Map in a hexagon is notation nobody needs, and offering it clutters every Resource's Actions menu.

Underneath, the Shape is tied to Open. The Map entry's schema repeats `shape` inside each arm of its Open/Closed union, the rule that decides what is drawn reads the Open state before it reads the Shape, CONTEXT.md defines a Shape as "the outline a Closed Resource is drawn in", and the outline geometry is fixed to the Closed Size. Open/Closed is the Map's, and it is right where it is; it just has nothing to do with the Shape.

## Solution

A Shape is a property of an Ur Resource on a Map, drawn whatever its Open state. Open, Close, Resize, Open Size and displacement are unchanged for every kind, the Ur Resource included: a Closed Ur Resource is its Shape at the Closed Size, and Opening and resizing it gives the same Shape at its Open Size. Only the Ur Resource offers the Shape choice; every other kind is the rectangle, and a stored non-rectangle Shape on any other kind is refused at intake.

## User Stories

1. As an author, I want an Ur Resource I have Opened to keep its Shape, so that a diamond stays a diamond when I make it bigger.
2. As an author, I want to resize an Open Ur Resource and see its Shape follow the size I drag to, so that I can fit the Shape to the diagram.
3. As an author, I want a resized pill to keep half-circle ends, so that it still reads as a pill at any size.
4. As an author, I want a resized ellipse, diamond and hexagon to fill the box I drew, so that the Shape is as large as the room I gave it.
5. As an author, I want Edges to meet the outline of a resized Shape at the middle of each side, so that connections look attached at every size.
6. As an author, I want an Ur Resource resized back to the Closed Size to Close, as any Resource does, so that the magnetic Close still works in a diagram.
7. As an author, I want Close on an Ur Resource to return it to its Shape at the Closed Size, so that Close shrinks it without changing its notation.
8. As an author, I want an Open Ur Resource's Title and kind glyph laid out inside its Shape, so that they never cross the outline.
9. As an author, I want an Ur Resource in a Shape other than the rectangle to show its short Title Open or Closed, so that the Title rule doesn't change when I resize it.
10. As an author, I want the selection ring to follow an Open Ur Resource's outline, so that selection looks the same at every size.
11. As an author, I want Opening, Closing and resizing an Ur Resource to move its neighbours exactly as they do for any Resource, so that the diagram makes room the same way everywhere.
12. As an author, I want the Shape choice in an Ur Resource's Actions menu whether it is Open or Closed, so that the menu doesn't change between states.
13. As an author, I want no Shape choice on a Markdown, Image, Space or Reference Resource, so that their menus offer only what makes sense for them.
14. As an author, I want a Reference Resource always drawn as the rectangle with its dotted border, so that a Reference reads the same wherever it is.
15. As an author, I want an embedded Map to draw its Ur Resources' Shapes, Open or Closed, so that a Map looks the same wherever it is drawn.
16. As an author, I want a Shape choice inside an embedded Map I may author offered only on Ur Resources, so that the rule holds there too.
17. As an author, I want a presented Resource drawn full-frame as it is now, so that presenting is unchanged by Shapes.
18. As an author, I want a Space whose stored data gives a non-Ur Resource a non-rectangle Shape refused at intake with a named reason, so that a state no gesture can make never loads.
19. As an author, I want a refused Shape change reported in words rather than failing silently, so that I know why nothing happened.
20. As an author, I want exporting and importing a Space to keep every Ur Resource's Shape, Open state and Open Size, so that the round trip holds.
21. As a maintainer, I want the stored JSON of a Map entry unchanged, so that no fixture, seed or migration has to move for the schema change.
22. As a maintainer, I want the Shape declared once beside position in the Map entry's schema, so that the Open/Closed union says only what Open/Closed means.
23. As a maintainer, I want one function to answer a Shape's outline and inscribed rectangle for any size, so that Closed and Open draw from the same geometry.
24. As a maintainer, I want CONTEXT.md, ADR 0117 and the Maps and Graphs contract to define a Shape without reference to Open, so that the docs and the code agree.
25. As a maintainer, I want the parity claims and stories for Shapes named and specimened for both Open and Closed, so that ADR 0052's evidence covers what is drawn.

## Implementation Decisions

- **Map entry schema.** `shape` is declared once on the entry's base beside the position, outside the Open/Closed union, which keeps only `open` and `openSize`. The derived types follow. The serialised form is identical, so fixtures, seeds and migrations do not change. `shape` stays required on every entry (A23 stands); a non-Ur Resource's is `rectangle`.
- **Intake.** `loadSpace` refuses a Map entry whose Shape is not the rectangle when its Resource is not an Ur Resource, with a named refusal code, beside the existing reference checks. Kind is read from the Resource, because the entry does not carry it.
- **The Shape Edit.** Space Authoring's `changed-resource-shape` completion is refused, with a named refusal the application puts into words, for a Resource that is not an Ur Resource. Choosing the Shape the Resource already has stays `unchanged`, Open or Closed.
- **Commands.** The Resource rail's Shape choice is built only for an Ur Resource, in both Open and Closed states, wherever the Map may be authored, embedded Maps included.
- **Geometry.** The Shape outline module answers the outline and the inscribed insets for a Shape *and a size*, rather than in fixed Closed Size units. Ellipse, diamond and hexagon fill the bounding rect proportionally. The pill's corner radius is half the smaller side, so its ends stay half-circles. The hexagon's point inset is a quarter of the width, capped at half the height. Every outline still touches the midpoint of each side of its rect at every size, where Edges attach.
- **Drawing.** The front draws the Shape from `shape` alone. The rule that answered the rectangle for any display but Closed is removed, along with the redundant Closed check in the stylesheet. The outline drawing is sized to the Resource's current rect, so its strokes are not stretched, and the inscribed insets set on the front follow the current size. The short Title follows the Shape alone: a non-rectangle Shape shows it at every size. The resize control stays at the bounding rect's bottom-right corner.
- **Presenting** is unchanged: a presented Resource is drawn by the presented surface, not on the Map.
- **Reference outline treatment retired.** A Reference Resource is never an Ur Resource, so it is always the rectangle; the dotted-outline drawing for a Reference in a Shape is unreachable and is removed with its story rows and its part of the treatment parity claim.
- **Docs, fixed in place.** ADR 0117 (title included, since it names "only a Closed Resource"), the Maps and Graphs contract R45–R50 (R46 becomes "only an Ur Resource takes a Shape", R48 states the Shape against the Resource's rect rather than the Closed Size, R49 is replaced by "a Shape is drawn Open and Closed alike"), and CONTEXT.md "Shape" ("the outline an Ur Resource is drawn in on a Map"). No new ADR: nothing on `main` changes, and ADR 0113's capability rule is unaffected because a Shape is now the Ur kind's, not a capability every Resource shares.

## Testing Decisions

- A good test drives the highest existing seam and asserts what an author or a stored document can observe: what loads or is refused, what Edit completes or is refused, which commands a Resource offers, what is drawn. No test asserts an internal helper's call or a CSS custom property's value except where a layout cannot be observed otherwise.
- **Intake:** `loadSpace` tests, with prior art in the graph package's reference-refusal tests: an Ur Resource in each Shape loads; a Markdown, Image, Space or Reference Resource with a non-rectangle Shape is refused with the named code; every kind with the rectangle loads.
- **The Edit:** Space Authoring tests in the app package (prior art: the existing `changed-resource-shape` cases): Shape changes complete on an Ur Resource Open or Closed, are `unchanged` for the current Shape, and are refused on every other kind.
- **Commands:** the Resource rail-actions test: the Shape choice is present on an Ur Resource Open and Closed, absent on every other kind, absent where the Map may not be authored.
- **Geometry:** the existing outline unit test, parameterised by size (a property test over sizes is appropriate): every outline touches each side's midpoint, the inscribed rectangle lies inside the outline, and the pill's radius is half the smaller side.
- **Drawing:** the application E2E and Ladle stories share the existing outline probe (prior art: the Shape outline helpers and `holdsTitleAndGlyph`). They prove an Open, resized Ur Resource draws its Shape and holds its Title and glyph inside it, that Close returns to the Closed Shape, and that an embedded Map draws Open Shapes. jsdom has no layout, so fit stays a Playwright proof; the front's rendering test asserts the drawn Shape attribute for Open and Closed displays.
- **Round trip:** the aggregate round-trip test moves its Shapes onto Ur Resources and still asserts Shape, Open state and Open Size survive export and import.
- Every test, story and fixture that gives a non-Ur Resource a non-rectangle Shape moves to an Ur Resource.

## Out of Scope

- The Closed Shape face module refactor (architecture candidate 1); it follows this work with `(shape, size)` as its input.
- Any change to Open, Close, Resize, Open Size, displacement or the magnetic Close, for any kind.
- How an Image Resource's picture is drawn while Closed, or when Replace is offered.
- Sizing a Resource without Opening it.
- A Shape on a presented Resource.
- New Shapes, or a free outline.

## Further Notes

- The data-attribute naming the drawn Shape stays the tests' observable.
- Tickets 02 and 03 of `.scratch/resource-shape/` still say Titles "truncate as they do now"; that housekeeping is separate from this spec.
