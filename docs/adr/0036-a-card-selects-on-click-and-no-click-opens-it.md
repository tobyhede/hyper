# A card selects on click, and no click opens it

Status: accepted
Related: 0006, 0011, 0033, 0035, 0037

A card drawn in the graph answers two pointer gestures. A **single click selects** it. A **double click on its title** renames it in place. Nothing a pointer does to the body of a card opens it: opening is reached through the card's own control (ADR 0037). Selecting is not authoring and not reading — it names the card the next gesture acts on.

React Flow's double-click zoom is turned off for the whole canvas, not suppressed per node.

## Why no click opens

Renaming on a double click cannot sit beside click-to-open. A double click is two clicks, and the first one opened the card — by the time the second arrived, a surface was covering the graph and the title was no longer on screen. Either a single click stops opening or the title has no pointer gesture.

Opening then moved to the double click, and that lasted exactly as long as it took to run: a card centres its title, so the centre of a card *is* the rename target. The two gestures wanted the same pixels, and shrinking the title to the text it draws left opening to a strip above and below a line of text — tight on a one-letter title and gone on a real one. A card is a 300px box, and there is not room in it for two pointer gestures that both want the middle.

So the body of a card answers one gesture, selection, and opening is a control rather than a gesture. This is the second half of one decision: the first half is that the title needs a pointer gesture, and it takes the double click uncontested.

Selecting is what the freed click should mean, because selection already existed and was doing nothing visible. React Flow sets it on click, `[data-selected]` already reveals the authoring handles (ADR 0033) and the title affordance, and `F2` already renames "the selected card". What the graph lacked was a way to say *this one* without also asking to read it — which is precisely what an authoring surface needs and a reading surface does not.

We rejected keeping click-to-open and letting the hover affordance and `F2` carry renaming alone. It works, and it is a smaller change. It also permanently forecloses the pointer gesture: with the single click spent on opening, every future card-level gesture has to arrive as another affordance drawn on the card, and a card is a 300px box that already carries a title, a description, an alias marker, four authoring handles and an edit control. The click was the last cheap gesture available, and it was being spent on the one action that also has a keyboard equivalent.

## The cost

Clicking a card is what a person tries first, and for a while opening will feel broken. Nothing in the test suite reports this; it is the kind of regression only use finds. The compensations are that the cursor stops promising a click target, that selection visibly answers the click, and that the control which does open a card is drawn on the card the moment a pointer reaches it.

The second cost is the canvas. Double-click zoom is a React Flow default whose filter exempts only `.nopan` elements, so a card does not suppress it — a double click on a card would open it *and* zoom the canvas underneath. Turning it off per node would leave double click meaning "open" on a card and "zoom" two pixels away. It is off everywhere instead, so double click means one thing on this canvas, and double-click zoom on empty space is gone with it.

## What this deletes

`titleEditInvalid` in `GraphView` swallowed exactly one click, because clicking away from a refused title blurred the field and opened the card underneath, so the refusal had to eat the click that carried it. A single click no longer opens anything, and the ref has no other reader. It goes.

`connectionGesture` is a narrower case. The flag itself stays — the Alt-modifier listener and the empty-canvas hover tracking both read it, and neither has anything to do with clicks. What goes is its `setTimeout`, which existed only to hold the flag raised past the node click React Flow dispatches on the pointer-up that ends a connection drag, so that click could not open the card just connected to. A drag release produces a `click`, never a `dblclick`, so the flag can be lowered where it is raised.

Both were load-bearing when written. Removing them is a consequence of this decision, not a cleanup that could have happened earlier.

## The negative to remember

A future review will look at a card that answers no click but selection and read it as an oversight — *a card is obviously clickable; wire the click to open it*. Doing that does not merely restore an old behaviour, it removes the title's rename gesture, because the click that opens is also the first click of the rename. The same applies to routing opening back through the double click: it was tried, and it collides with the title in the middle of the card. If opening must become a gesture again, the title's pointer rename goes with it and this decision is superseded rather than adjusted.

The same holds for `zoomOnDoubleClick`. Re-enabling it, or exempting cards with `.nopan` instead, restores a canvas where double click means two different things depending on where the pointer lands.
