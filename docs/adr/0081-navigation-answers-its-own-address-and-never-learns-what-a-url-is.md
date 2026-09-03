# Navigation answers its own address and never learns what a URL is

Status: accepted
Related: 0028, 0040, 0042, 0069

Navigation holds five values — the selected renderer, the Active Graph, the
mode, and while presenting the Traversal history and the branch index. Three of
those determine which addressable position the reader is at: the renderer, the
Graph, and the Card being presented. Every operation that writes them returns
`void`, so a caller cannot learn the resulting position from the call.

`App.tsx` therefore reconstructs that position four times, each time by sampling
`navigation.getState()` around the call and comparing the one field the caller
happened to supply — the renderer at the Space View row, the Graph at the Graph
row, and the length of the Traversal history twice for `advance` and `retreat`.
A fifth reconstruction sits in an effect behind a `previousRenderer` ref, because
Edit completion adopts a renderer through `continueInRenderer` and App never made
a call it could read an answer from. None of the five compares the position; each
is a different partial proxy for it, and the rule they implement is observable
only through a spy on `window.history.pushState`.

**Navigation answers a `NavigationAddress` — the selected renderer, the Active
Graph and the presenting Card — derived from its state by a pure function rather
than stored as a field on it.** Derived, because a stored field would have to be
maintained at all six publish sites and could disagree with the state it
describes; derived, it cannot. The address is Navigation's own type in
Navigation's own vocabulary.

**Navigation does not learn what a URL is.** Its imports remain `@project/core`,
`@project/graph`, `@project/persistence` and `./renderer`. It does not import
`ProductDestination`, does not answer one, and does not read
`window.location`. Deciding what URL a position deserves stays in `app`, which is
the only module that knows both sides.

**A second pure function in `app` decides what the browser should do**, answering
`push`, `replace` or `none` by comparing the address against the destination the
current pathname resolves to:

- the pathname already resolves to this exact address — do nothing;
- the address is unchanged but the pathname is narrower or stale — replace;
- the address changed — push.

The third outcome is new. Today every path pushes or replaces, and the reason a
repeated choice still replaces is that Navigation may have cleared a Card or
Graph the URL still names — which is the second outcome, stated rather than
inferred.

## The alternative that was rejected

The obvious shape is for Navigation to answer a `ProductDestination` directly, or
for each operation to return `'moved' | 'settled'`. Both were rejected.

Answering a `ProductDestination` puts `@project/http` inside the module that owns
traversal, and puts the addressed Card — which belongs to `app`, is read from the
URL and never written back — into a value Navigation produces. Navigation would
then hold two vocabularies for one position.

Returning a discriminant per operation does not cover `continueInRenderer`, whose
caller is Edit completion rather than App, so the ref-diff would survive and the
rule would remain in two shapes. It is also unreliable: React coalesces
publications, so a flag relative to Navigation's own previous publication
describes a transition an observer may never see. The comparison has to be
against the address the browser was last synced to, which only `app` knows.

## The costs accepted

Deciding in an effect rather than on the line after the call means push and
replace become asynchronous with respect to the operation, and history entries
become one per committed address rather than one per operation — two operations
inside a single tick net to one entry.

It also means `popstate` moves Navigation, which would otherwise push a history
entry over the entry the browser just navigated to. The pathname comparison is
what prevents that, and it is not a guard bolted on: it is the same rule that
already protects the one effect of this shape in the tree today, generalised.
Because the decision reads the current pathname rather than tracking whether it
wrote it, the push is idempotent by construction and StrictMode's double
invocation is harmless.

Two behaviours change. `advance` across a self-Edge appends the same Card and
grows the Traversal history without moving the address, and `retreat` out of a
two-entry history of one Card does the same in reverse. Both push a duplicate
address today; both now replace. This follows from addressing the position rather
than detecting that state changed, and is the reason the fact is the address and
not "did anything publish".

`adoptedRendererDestination` and its `previousRenderer` ref are deleted; the rule
they carried — do not widen the URL to a Space View when it already names a Graph
or Card inside that same Space View — becomes the middle outcome above.
`installDestinationOpening`'s own renderer comparison is **not** one of the four
and survives: it gates whether the render adapter resets its placement, which is
a different question with the same shape.
