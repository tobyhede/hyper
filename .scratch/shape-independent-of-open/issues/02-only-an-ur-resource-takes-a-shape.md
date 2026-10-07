# 02: Only an Ur Resource takes a Shape

**What to build:** an author sees the Shape choice in an Ur Resource's Actions menu, Open or Closed, and on no other kind. A Shape Edit on any other kind is refused with a named refusal the application puts into words, and a stored Space giving a non-Ur Resource a non-rectangle Shape is refused at intake with a named code. Every other kind is drawn as the rectangle. A Reference Resource is never an Ur Resource, so its dotted outline in a Shape is unreachable and is retired with its story rows and its part of `closed-resource-treatments-follow-its-shape`.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] `loadSpace` loads an Ur Resource in every Shape and every kind in the rectangle, and refuses a Markdown, Image, Space or Reference Resource in any other Shape with a named code.
- [x] Space Authoring completes a Shape change on an Ur Resource Open or Closed, answers `unchanged` for its current Shape, and refuses it on every other kind; the refusal is worded.
- [x] The Resource rail offers the Shape choice on an Ur Resource only, Open or Closed, and nowhere the Map may not be authored, embedded Maps included.
- [x] Every test, story and fixture that gave a non-Ur Resource a non-rectangle Shape (Shape E2E, embedded-Map tests, aggregate round trip, Shape stories) uses an Ur Resource instead, and still proves what it proved.
- [x] The Reference-in-a-Shape outline treatment, its story rows and its claim are removed.
- [x] CONTEXT.md "Shape" and the Maps and Graphs contract R46 say only an Ur Resource takes a Shape.

**Resolution:** intake and the Shape Edit both refuse with `shape-requires-ur-resource`, worded in `authoring-refusal.ts`; `resourceRailGroups` draws the Shape choice for an Ur Resource only. The front's adapter test (`ResourceNode.test.tsx`, "draws the Map's Shape on the Closed front and the rectangle on the Open one") still renders a non-Ur node in a diamond; it is a rendering test with no intake, and ticket 03 rewrites it.
