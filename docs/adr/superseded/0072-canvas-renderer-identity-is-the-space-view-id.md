# Canvas renderer identity is the Space View Id

Status: superseded
Superseded by: 0079
Refines: 0031, 0068

A canvas renderer is identified by the durable UUID of the Space View it
draws. Computed Views and authored Layouts share that one UUID namespace in
memory and in persisted selections. Resolution determines which kind the Id
names; the identity does not carry a variant tag alongside it.

This aligns renderer selection with the addressable Space View model. Intake
rejects a Layout whose Id collides with an available Computed View, so a UUID
can resolve to at most one renderer and neither kind needs precedence. Product
URLs, stored defaults, Navigation and canvas composition can therefore pass the
same identity without translating between flat and tagged representations.

We rejected retaining a tagged `CanvasRendererId` only in memory. A tag would
duplicate information resolution already owns, create a second representation
of the same Space View identity, and permit callers to construct a tag that
disagrees with the Space. The cost of the flat identity is that its kind is not
known until resolution, which is already the boundary that validates the Id.
