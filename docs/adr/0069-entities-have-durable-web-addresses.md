# Entities have durable web addresses

Status: accepted
Related: 0068

Every Space, Card, Graph and Space View has a durable product URL built from its
Id. A URL may identify the entity alone or establish an explicit Space View,
Graph or presentation context; explicit context wins for that navigation and
never edits the authored active selections. Titles never participate in
identity. Computed View names may therefore change without breaking links,
because their stable UUIDs are the public identity.

Product URLs encode each UUID's existing 128 bits as an unpadded 22-character
base64url value. This is only a browser-route representation: the domain,
stored documents, HTTP resources and exports continue to use canonical UUID
spelling. Product routes accept one representation rather than creating two
canonical URLs for every entity, and carry no API-style version segment.

The routes distinguish canonical entity destinations from contextual ones:

```text
/spaces/:spaceId
/spaces/:spaceId/cards/:cardId
/spaces/:spaceId/graphs/:graphId
/spaces/:spaceId/views/:spaceViewId
/spaces/:spaceId/views/:spaceViewId/cards/:cardId
/spaces/:spaceId/views/:spaceViewId/graphs/:graphId
/spaces/:rootSpaceId/views/:rootSpaceViewId/graphs/:rootGraphId/present/:cardId
```

A canonical Card uses the Space's active Space View when it contains the Card.
When an active Layout omits it, the Cards collection reveals it without
manufacturing a canvas position; an explicitly contextual Layout-and-Card URL
instead asserts membership and is not found when the Layout omits the Card. A
canonical Graph uses its owning Layout. A contextual Graph is not found when
the selected Space View cannot show it.

A presentation URL names the current Card, not the Traversal history used to
reach it. For a cross-Space point, a canonical query value carries the ordered
Space Card crossings and each target Space View and Graph; the immutable Space
references derive the intervening Spaces. That context is part of the
destination because it determines which exit Edges are available. Browser
history remains linear local navigation: every presentation move and every
other change of addressable destination pushes an entry, and Back follows the
entries that browser actually visited.

Resolving a URL is navigation and never authoring. In particular, visiting a
Card URL does not change a Layout's Open/Closed state, membership, active Space
View or Active Graph. A Closed Card may be selected, focused and centered; a
Card absent from the active Layout may be revealed in the Cards collection.
Pure surface state such as cameras, Sidebar expansion, selection, Interaction
drafts and authored Open/Closed state is not encoded in the URL.

The HTTP host resolves the same destination contract as client navigation. A
malformed compact id or impossible route shape is a bad request; a well-formed
entity or contextual combination that does not resolve returns an actual HTTP
404 and the corresponding application surface. Resolution never silently
chooses another named entity. A collision between a Computed View and Layout id
is instead a broken invariant and neither variant takes precedence.

The application holds one `entrySpaceId`, separate from every authored Space.
`/` temporarily redirects to that Space's canonical URL and client navigation
replaces the root history entry. Any Space may still be loaded independently as
the root of its own navigation context. Changing the Entry Space is an
application operation rather than a Space Edit; deleting it is refused until a
different existing Space is selected, and repository bootstrap establishes it
explicitly. A missing configured Entry Space makes `/` not found.

This rejects several tempting alternatives. Human-readable titles are mutable
and non-unique, variant tags expose a Computed View/Layout distinction the UX
does not make, ownership-chain Space URLs break when references change, and
encoding Traversal history makes cyclic presentations grow URLs without bound.
Serving the app shell with `200` and drawing a client-only not-found message was
also rejected: these are web addresses, so direct requests carry real HTTP
semantics.
