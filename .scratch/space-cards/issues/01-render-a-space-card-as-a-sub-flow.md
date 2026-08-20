# Render a Space Card as a sub flow

Status: needs-triage
Blocked by: 02 — Grill the Space Card model (resolved; ADR 0058); 03 — Build the Space Card kind in core

Surfaced by: asking how a Space Card should be drawn, while deciding the View
interface for ADR 0045

## The idea

A Space Card points at another Space. Today nothing says what it looks like on
the canvas beyond being a Card. The proposal is that it renders as a **frame**
containing the Space it points at — a portal onto that Space's Layout, drawn in
place rather than only on open.

```
[Card]

[Space Card      ]
[ [Card] [Card]  ]
[                ]
```

Expandable: collapsed it is an ordinary Card Front; expanded it draws the
nested Layout. Making the nested Space *editable* through the frame is a
separate question and explicitly not part of this one.

React Flow calls this a **sub flow** and it is a documented feature: "A sub flow
is a flow inside a node." It is not a second canvas — it is nodes inside one
canvas with `parentId` set, sharing one store and one viewport. The mechanism
and its constraints are recorded in
`.scratch/react-flow-guidance/findings.md` §8.

## What blocks it outright

**There is still no Space Card in the schema.** `cardSchema` is
`z.discriminatedUnion('kind', [markdownCardSchema, aliasCardSchema])`
(`packages/core/src/schema.ts:117`) and `'space'` appears nowhere in `core`.
This is now an implementation gap rather than an open design question: Issue
02 settled what a Space Card is (ADR 0058) — kind `space`, a bare
`{ spaceId }` reference with no pinned Layout/View, ownership rather than a
retargetable pointer, atomic creation, cascading deletion, and cycle
rejection at `loadSpace` intake. The "Space plus a configured Layout/View"
framing this ticket originally floated was rejected: a Space Card always
opens to whatever the target Space's own renderer choice currently is.

## What it runs into, once the kind exists

**One viewport.** A sub flow shares the parent's store and camera, and a child's
position is relative to the parent's top-left. The nested Layout's own
coordinates therefore need transforming into the parent's space rather than
passing through, and the nested content renders at the parent's zoom.

**ELK does not do the hierarchy today.** `elkStrategy` builds a flat graph.
Arranging a Layout containing an expanded Space Card needs ELK's compound-node
support — real adapter work, and the seam that would feel it is
`LayoutStrategyGraph`, which has no notion of a nested card set.

**React Flow permits an Edge the domain forbids.** Sub flows explicitly allow
"connections that go from a sub flow to an outer node". ADR 0040 closes every
Edge over its owning Layout's Card set, and a nested Space's Cards are not
members of the outer Layout. That gesture has to be refused deliberately — a
connection dragged from a Card inside the frame to a Card outside it is
something the library will happily offer.

**Presenting and the camera.** ADR 0044 frames the presented Card with one
`fitView({ nodes: [{ id }] })`. What that means for a Space Card — frame the
card, or frame something inside it — is undecided, and traversing *into* a
nested Space during presenting is a Graph navigation question ADR 0024 does not
cover.

## Not in scope here

Editing the nested Space through the frame. Nested presenting. Whether a Space
Card can be expanded in more than one Layout at once. Recursion depth and what
stops a Space containing itself — ADR 0009's single-hop rule is about Aliases
and says nothing about Space nesting.

## Suggested next step

Blocked on Issue 03 (build the kind in `core`). Schedulable once that lands.
