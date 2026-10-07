# A Resource's size is independent of Open

Status: accepted
Supersedes: 0066
Refines: 0064, 0084, 0093, 0106, 0113, 0114, 0121

A Resource on a Map has a **size**, and whether it is Open is a separate fact. Until now they were one fact: a Closed Resource was always the fixed Closed Size, an Open one was its remembered Open Size, and Open and Close were what changed a Resource's size. An author who wanted a bigger diamond or a wider Markdown card had to Open it first, and Opening also changed what was drawn inside it and moved its neighbours. For an Ur Resource, which has no content, Open meant nothing except "bigger".

**Resize is the only thing that changes a size.** It is available on every Resource, Open or Closed, of every kind. A Map entry is `{ x, y, open?, size?, shape? }`. `size` is optional and the application's default is the Closed Size (260×146), as `shape` defaults to the rectangle (ADR 0121) and a Graph's `headShape` to the arrow (ADR 0105). One resolver in `@project/core` answers the size an entry draws at. No Edit writes a size on a Resource's behalf: Add Resource and Add to Map write none.

**The Closed Size is the one floor for every kind, Open or Closed.** No kind has its own minimum. Content adapts to the rect it is given: a small Open document scrolls, a picture scales down, an embedded Map fits.

**Open is an affordance of content.** `open` is optional and the application's default is Closed. Opening or Closing changes only what is drawn inside the Resource's rect — its Title, or its content — and never its size or any position. Edit on a Closed Resource still Opens it before placing the caret (ADR 0064); that Open changes no size either. Only a kind with content to show offers Open: Markdown, Image, Space and Reference. An Ur Resource has none, so it offers no Open, the Open Edit refuses it, and intake refuses a Map entry storing an Ur Resource Open, both as `open-requires-content`.

This reverses ADR 0113's rejection of a kind that cannot be Opened. That rejection rested on Open/Closed being how every Resource's size was authored, so withholding Open would have withheld resizing. With size its own fact, Open only shows content, and showing content is something a kind adds: Open joins the actions a kind's content supports. Every capability that changes the Map — position, size, Shape, Edges, membership — stays every Resource's.

**Resize still displaces, and nothing else does.** A Resize moves the Resources its growth passes, as one Edit when the drag ends, by ADR 0093's one-axis rule measured from the Resource's size before the Resize rather than from the Closed Size. Open and Close move nobody, so there is nothing for Close to reclaim; and removing or deleting a Resource, Open or not, moves nobody either.

**The resize control is offered on the selected Resource**, Open or Closed, any kind, wherever its Map may be authored. It is the existing bottom-right control, with its look and behaviour unchanged: one control changing both dimensions from a fixed top-left origin, a drag that is an Interaction draft producing one Edit on release, and no keyboard resize. A selected Resource drawn in a Shape other than the rectangle also draws a thin rectangular border around its rect, so the control sits on that border's corner; the rectangle's own edge is its border. Edge handles and attachment are unchanged, and so is the presented Resource.

## What retires

- **Open Size**, and Open Size surviving Close (ADR 0066). A Resource has one size, kept through Open and Close alike.
- **First-Open sizes**: the default Open Size, an Image Resource's natural size plus the Open front's chrome (ADR 0106), and a Reference Resource's Target's first-Open geometry (ADR 0114). A Resource Opens at the size it has.
- **Kind-specific floors**: the Space Resource's Open minimum (ADR 0114).
- **The magnetic Close** (ADR 0066). A Resize back to the Closed Size is an ordinary Resize and leaves the Resource Open.
- **Displacement on Open and Close**, growth measured against the Closed Size, and Close's reclaim on Remove and Delete (ADR 0084, ADR 0093).

What ADR 0066 decided and this keeps — resizing is every Resource's rather than a kind's, one control, one Edit per drag, no keyboard resize, Authoring rather than React Flow deciding the Edit — is restated above, so ADR 0066 is superseded rather than refined: its title and its stored `openSize` both name the fact that no longer exists.

## Considered options

- **Keep Open Size and add a separate Closed size.** Rejected: two sizes per entry for one rect on screen, and an author would still have to learn which state they were sizing.
- **Keep Open/Close changing size, and let a Closed Resource resize too.** Rejected: Open would still move neighbours and change a size the author set, which is the coupling that made a bigger diamond a two-step gesture.
- **Keep kind-specific floors**, so a Space Resource cannot be resized below room for its Map's footer. Rejected: one floor is simpler to state and to draw, and an embedded Map fits the rect it is given.
- **Size required on every entry.** Rejected for the reason ADR 0121 gives for `shape`: an optional field whose default the application chooses is the format's pattern.
- **Let an Ur Resource Open, showing only its Title.** Rejected: with size independent of Open, Opening an Ur Resource changes nothing a reader can see, so offering it is a control with no effect.

## Consequences

The Map entry schema drops the Open/Closed discriminated union and `openSize`, and gains optional `open` and `size`; the entry is strict, so a stored `openSize` is refused. Tracked fixtures and seeds roll forward in the same change: an Open entry's `openSize` becomes its `size`, and a Closed entry drops the `openSize` it remembered, since it was drawn at the Closed Size. Nothing changes on screen. Undo is still not built; a Resize that displaces is one Edit, the unit a future undo reverses.
