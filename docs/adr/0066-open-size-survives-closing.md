# Open Size survives Closing

Status: proposed
Refines: 0064

Opening and size are separate facts in a Layout's Placement. Every entry carries
an explicit Open or Closed state; an Open Size is absent only until that Card
first Opens in that Layout. First Open records the concrete default Open Size,
Resize changes it, and Close changes only the state, so the next Open returns to
the same rect. This keeps Layout geometry stable when application defaults later
change.

Closed Size is fixed domain policy rather than authored data, so Placement does
not repeat it for every Card. The effective-size operation returns the fixed
Closed Size for a Closed entry and its remembered Open Size for an Open one. An
optional stored Closed Size was rejected: it would create two document shapes
for the same fact, while a required one would repeat a value that never varies.
If Closed Cards become independently resizable, that is a domain and format
change to roll through the repository then.

Resizing is core Card behaviour rather than behaviour supplied by a Card kind.
A kind owns what fills its Open Card, while the Card owns the surrounding rect
and resize interaction. The unresolved UX for a kind's Open content therefore
does not create a second resize model.

A resize drag is an Interaction draft and produces one Edit when it ends. It
either changes the Open Size or, when both dimensions reach the fixed Closed
rect, performs Close without first replacing the remembered Open Size. A Close
completed this way records the Closed state and nothing else: it writes no
Closed Size, because the rect the canvas then draws is the fixed Closed Size the
effective-size operation already returns for any Closed entry. This semantic
snap is not a general spatial grid; grid snapping remains undecided. The
interaction's magnetic range is not persisted either — no distance the author
dragged reaches the Layout, only the state the drag settled on. That distance is
application-owned interaction tuning, reviewed at multiple zoom levels rather
than fixed by the domain.

Authoring, not React Flow event wiring, decides whether the proposed rect
completes Resize or Close. An Open Card may share either the Closed width or the
Closed height while it remains larger on the other axis, but the complete Closed
rect cannot also be Open. These rules apply to every Card kind. A kind owns the
content shown while Open, not whether Placement may Open or Resize that Card.
Intake rejects an Open entry without an Open Size; it does not invent one from
the default during intake.

During the drag, the proposed rect and every displacement derived from it are a
transient preview: neighbours move continuously without changing the Space. A
cancelled gesture or one invalidated by replacement returns the complete canvas
to its last authored geometry. On release, the one Edit adopts the geometry
already being previewed, so publication does not introduce a second jump.
The render adapter owns that draft beside its existing projection and drag
bookkeeping; Space Authoring receives only the final proposed size. One
draft-over-authored Placement feeds the Card, neighbours, handles and Edges, so
no consumer patches one node while the rest of the canvas sees another rect.

An automatic strategy supplies Closed entries with no Open Size. Conversion
copies them into the Layout; the first Open then adds the concrete default Open
Size as part of the same Edit. No other Algorithmic View behavior changes.

The Card exposes one bottom-right React Flow resize control while it is Open and
hovered, Selected, or contains focus. One control changes both dimensions
without moving the authored top-left origin, and avoids drawing controls whose
gestures the model would refuse. Its hit target may be larger than its visible
mark. Resizing is pointer and touch only in this iteration: React Flow supplies
no keyboard contract, and Hyper does not invent a hidden arrow-key resize mode.
If keyboard sizing is required later, explicit dimensions are the more
discoverable candidate.

The schema must enforce that an Open Card has a concrete Open Size, while
allowing a Closed Card to retain one and a Card that has never Opened to have
none. Placement owns the one effective-size operation used by displacement,
rendering, Edge geometry and hit testing, so those consumers cannot choose
different rects.
