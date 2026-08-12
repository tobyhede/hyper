# Convert a View into a Layout that owns its Graph

Status: ready-for-agent
Blocked by: 02

## What to build

Editing an Algorithmic View creates a Layout that **owns** a fresh initial
Graph, in the same Edit, rather than appending a Graph to a Space-level list
that no longer exists. An Edge drawn in that same gesture lands in that owned
Graph. Editing an already selected Layout writes into a Graph that Layout
already owns.

This is ADR 0045's boundary, and the point of the ticket is *where* the rules
live. A View receives a subject — Cards, and zero or more Graphs. On conversion
it returns everything needed to make a Layout: those Cards with their positions,
and one or more Graphs. `ResolvedView` gains both sides: an explicit Card
subject going in, and a conversion result coming out.

**The two obligations are enforced at that boundary and nowhere else.** Every
Edge endpoint of every returned Graph is among the returned Cards. Every
returned Graph carries a fresh identity owned by the new Layout. Enforcing them
at the seam rather than inside a View is what makes them hold for Views nobody
has designed yet, and the fresh-identity rule is the mechanism that makes ADR
0040's ownership structural — no View, present or future, can hand two Layouts
one Graph.

**Flow returns a fresh empty Graph on conversion.** That is this View's choice
among legal outputs, so it lives in the View and not in the boundary. A copy of
the emphasised Graph would also satisfy both obligations; it is not what this
View does, because a copy is how two Graphs carrying one title start diverging
silently.

Activating a Graph on an Algorithmic View stays emphasis and nothing else. It
converts nothing, and a later connecting Edit still joins the new Layout's own
initial Graph rather than the Graph that was emphasised.

**The two connection predicates need more than a mechanical rewrite.** They are
the only places that read the document's Graph collection directly, and both
answer wrongly once conversion mints the Graph. `canConnect` refuses an exact
duplicate by checking the Active Graph — but on an Algorithmic View the Edge
joins the fresh Graph conversion mints, not the emphasised one, so no duplicate
is possible and the refusal must be conditional on a selected Layout.
`canCreateConnectedCard` is the mirror: it currently demands either no Graphs at
all or an existing Active Graph, and on an Algorithmic View it should simply be
true. Keep `canCreateConnectedCard`'s signature — `connection-gesture` consumes
it as its `accepts` capability and that seam is not moving.

The placement writer and the derivation in Space Authoring both change shape:
they compose a Layout with its Graphs instead of folding a Layout into a Space
that holds Graphs separately. Keep the existing structure while doing it — pure
derivation before installation, `session.submit` first in the install window, the
renderer adopted before the Graph it minted is activated. None of that ordering
is up for renegotiation here.

## Green bar

Shared branch. `pnpm verify` is still red on purpose — see `02`. The scoped bar
for this ticket, plus `02`'s, must pass:

```
pnpm --filter @project/app typecheck
pnpm vitest run packages/app
```

Migrate `packages/app/test` here. Note the per-package config covers `src` only,
so the app's own typecheck passing does not mean its tests compile — the vitest
run is what proves that.

## Acceptance criteria

- [ ] `ResolvedView` names its Card subject and answers a conversion result of
      Cards-with-positions plus one or more Graphs.
- [ ] Conversion from an Algorithmic View produces a Layout owning exactly one
      fresh, empty Graph, which is also its Active Graph.
- [ ] A connection drawn in the converting Edit lands in that Graph, in the same
      Edit, with nothing left at the Space level.
- [ ] An Edit on a selected Layout adds its Edge to a Graph that Layout owns.
- [ ] A property test proves no View output can violate closure or return a
      source Graph's identity.
- [ ] Activating a Graph on an Algorithmic View submits nothing, and a
      subsequent connection joins the new Layout's initial Graph.
- [ ] Drawing an Edge on an Algorithmic View is offered even when the emphasised
      Graph already holds that exact Edge, and refused on a selected Layout whose
      own Graph holds it.
- [ ] `canCreateConnectedCard` keeps the signature `connection-gesture` consumes.
- [ ] Existing Space Authoring guarantees still hold under fault injection:
      derivation is total before installation, and a failing submit leaves
      placement and Navigation untouched.
