# Open and expand Opens a Resource and sizes it to its content in one Edit

Status: accepted
Refines: 0122, 0084, 0093

ADR 0122 made a Resource's size independent of Open: Open changes only what is drawn inside the rect, and only Resize changes a size. So a long document Opens into the Closed Size's 260×146 and scrolls there, and reading it on the canvas takes an Open and then a resize drag that has to guess the size its text needs. **Open and expand** is the one gesture for "show me this on the Map": `Shift+Enter` on a Resource, or Open and Expand in its Actions menu.

**It is one Edit that Opens the Resource and Resizes it** (`SnapshotEdit.openAndExpand`, completion `opened-resource-to-fit`). Its checks are Open's: an Ur Resource has no content to show and is refused `open-requires-content`, sizing nothing. The size is floored at the Closed Size on each axis, and the Resources the growth passes move exactly as a Resize moves them (ADR 0093's one axis, measured from the size before the Edit), all as one unit (ADR 0084). It is `unchanged` only on a Resource already Open at that size. Open on its own still changes no size, and a Resize on its own still leaves Open as it is: ADR 0122's rule becomes **only Resize and Open and expand change a size, and Open and Close change only `open`**.

**The size is the content's, at a reading width, capped at what the canvas shows.** The width is 640, or the Resource's own when it is wider. The height is what the Open Resource's content needs at that width, and at least the Stage's 16:9 frame at that width (ADR 0123), which is the room a picture or an embedded Map is given, since content that adapts to its rect asks for none. Both are capped at the visible canvas at the current zoom, less a margin, so the Resource never grows past what the author can see. The application measures the need, drawing the Open Resource hidden through the same `CanvasResource` the canvas draws and growing it by however far its content overflows; the domain takes the size it is handed, as it takes a Resize drag's.

**The camera then frames it** at the current zoom, centring the Resource's new rect. Only the canvas's own Map is expanded, because the camera is its alone; a Map drawn inside a Space Resource offers neither the key nor the menu item.

## Considered options

- **Open at a fixed bigger size.** Rejected: a short note and a long essay want different rooms, and a fixed size brings back the first-Open size ADR 0122 retired.
- **Open, then Resize, as two Edits.** Rejected: a reload or a conflict between them leaves a Resource Open at the Closed Size, and a future undo would take two steps to reverse one gesture.
- **Size to the full window, or let the content set the zoom.** Rejected: the Map is still the surface being read, and a Resource larger than the visible canvas cannot be seen whole. Reading one Resource over the whole window is Full View's job.
- **Measure content in the domain**, from the source's length. Rejected: what a document's text needs is a fact of its type and width, not of its bytes.

## Consequences

R38 and R44 of `docs/agents/maps-and-graphs.md` name Open and expand beside Resize. The resize drag is still the only continuous resize and there is still no keyboard resize: `Shift+Enter` asks for the content's size, not a size the author steps through.
