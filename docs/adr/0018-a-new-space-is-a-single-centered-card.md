# A new space is a single centered card

Status: accepted
Refines: 0015, 0017
Related: 0025

Opening the app with nothing else to open gives you a **new space: one card, centered**. That is the default, not the bundled fixture and not an empty canvas.

An empty canvas is the wrong first screen because there is nothing on it to act on. Every gesture the app has — open a card, drag a card, step a route — needs a card to point at, so a blank space offers the author no way in and no clue that one exists. It also renders as a failure state: an author who has just been told they made a space sees nothing and reasonably concludes it did not work. One card is the smallest thing that is already a space rather than a promise of one, and it is immediately draggable, openable and editable.

Centered rather than at the origin, because the origin is an artefact of the coordinate space and not a place anyone chose. A single card at `(0, 0)` sits in a corner of the viewport with the rest of the canvas stretching away from it, which reads as "there is something else over there" when there is not. Centered, the card reads as the whole content, which it is.

We rejected opening the **fixture** by default. It is a purpose-shaped test bed, deliberately abstract (`A`, `B`, `C`, two disconnected collections) so e2e asserts behaviour rather than prose — content designed for tests is not content designed for a first run, and shipping it as the default would make the app's opening screen a thing nobody authored on purpose. We also rejected a **template** of several cards and a starter route: it presumes a structure the author has not chosen, and the whole point of authored placement (ADR 0013) is that structure is theirs to make.

The consequences. A new space has no routes, so it renders and cannot be presented — exactly the state ADR 0015 made legal, now the state every author starts in rather than an edge case. It gets a Layout the moment it opens (ADR 0017), so its one card is positioned and draggable from the first frame. And the app now creates something on every load with nothing to open, so "opened the app" and "made a space" are not distinguishable — the same cost ADR 0017 accepted for Layouts, for the same reason: the alternative is a surface that looks broken until you find the button that makes it work.
