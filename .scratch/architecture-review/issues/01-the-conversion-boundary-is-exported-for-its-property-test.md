# The conversion boundary is exported, and the handoff said tests go through the resolver

Status: resolved

Surfaced by: two-axis review of `243b77a` against `main` (`00e7962`)

## The deviation

`packages/app/src/renderer.ts` exports `convertSubject` and `checkSubject`, and
`packages/app/test/renderer.property.test.ts` calls both directly. The handoff
says the opposite twice:

> Renderer tests go only through a composed deterministic resolver

> Build Flow and Grid through a private immutable registry now so several
> definitions exercise one internal module shape without creating a hypothetical
> public seam.

Its interface listing (the `RendererSubject`/`ResolvedRenderer`/
`createRendererResolver` block) names neither function.

The justification standing in `AGENTS.md` — that the boundary is exported so a
View nobody has designed yet can be pushed through it — was written by the same
commit as the export. It is a statement of this decision, not authority for it,
and reading it as authority is what this file exists to prevent.

## Why it stands

ADR 0045 outranks the handoff in the handoff's own authority order, and the
obligation it states is about the boundary rather than about Flow and Grid:

> every Edge endpoint of every returned Graph is among the returned Cards, and
> every returned Graph carries a fresh identity owned by the new Layout

Flow and Grid are three lines each, select the whole Space, and answer one empty
Graph. Neither can break either obligation, so a proof that goes only through the
composed resolver proves the obligations hold for the two Views that could not
break them and says nothing about the case ADR 0045 is written for. The hostile
policies in the property test — an Edge naming a Card outside the Placement, a
repeated Edge, no Graph at all — are unreachable through `createRendererResolver`
because `BUILT_IN_VIEWS` is private and `RendererSelection` is closed over
`BuiltInViewId`.

Weighed and rejected:

- **Delete the hostile-policy properties.** Restores the handoff's letter and
  removes the only proof that a future View cannot get past the boundary. The
  handoff's own Step 3 asks for "invalid policy output consumes no identities",
  which no legal policy can exercise.
- **Take a View definition as a resolver parameter for tests.** That is the
  public View registration seam the handoff and ADR 0045 both defer, invented for
  a test.

## What it costs, and what would close it

Two functions on the module's surface that no application code calls —
`createRendererResolver` is the only caller in `app`, and the private registry is
still the only way to select a View, so nothing about View selection widened.

Closing it means one of: a registration seam decided on its own terms (persisted
View ids, missing-plugin behavior), or a second built-in View whose policy is
non-trivial enough that the obligations can be exercised through the resolver.
Until then the export is the smaller cost.
