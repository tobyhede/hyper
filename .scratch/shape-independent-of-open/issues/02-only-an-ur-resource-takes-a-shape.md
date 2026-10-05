# 02: Only an Ur Resource takes a Shape

**What to build:** an author sees the Shape choice in an Ur Resource's Actions menu, Open or Closed, and on no other kind. A Shape Edit on any other kind is refused with a named refusal the application puts into words, and a stored Space giving a non-Ur Resource a non-rectangle Shape is refused at intake with a named code. Every other kind is drawn as the rectangle. A Reference Resource is never an Ur Resource, so its dotted outline in a Shape is unreachable and is retired with its story rows and its part of `closed-resource-treatments-follow-its-shape`.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] `loadSpace` loads an Ur Resource in every Shape and every kind in the rectangle, and refuses a Markdown, Image, Space or Reference Resource in any other Shape with a named code.
- [ ] Space Authoring completes a Shape change on an Ur Resource Open or Closed, answers `unchanged` for its current Shape, and refuses it on every other kind; the refusal is worded.
- [ ] The Resource rail offers the Shape choice on an Ur Resource only, Open or Closed, and nowhere the Map may not be authored, embedded Maps included.
- [ ] Every test, story and fixture that gave a non-Ur Resource a non-rectangle Shape (Shape E2E, embedded-Map tests, aggregate round trip, Shape stories) uses an Ur Resource instead, and still proves what it proved.
- [ ] The Reference-in-a-Shape outline treatment, its story rows and its claim are removed.
- [ ] CONTEXT.md "Shape" and the Maps and Graphs contract R46 say only an Ur Resource takes a Shape.
