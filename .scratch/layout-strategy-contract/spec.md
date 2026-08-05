# What the LayoutStrategy seam actually guarantees

Source: `/improve-codebase-architecture` review, 2026-08-04.

## Read first

This is the second record over one seam, not a fresh subject.
`.scratch/layout-seam/` holds the first — eight issues, all resolved, and the
directory `AGENTS.md` cites — and it is where the shape being questioned here
came from. The four worth reading before touching this:

- `layout-seam/spec.md` — why geometry rides as optional fields on the elements
  rather than in a result object, checked against ELK's and React Flow's own
  types. A capability declaration must not become that object by another name.
- `layout-seam/issues/06-revisit-async-optionality.md` — the same seam, the same
  question, already answered once: an optional capability was carried until a
  caller needed it, then collapsed when none appeared. Its `## Answer` is the
  precedent for how to decide `01` here.
- `layout-seam/issues/03-render-elk-edge-routing.md` — where `LayoutEdge.sections`
  and the bezier fallback in `RoutedEdge.tsx` came from.
- `layout-seam/issues/01-namespace-elk-port-ids.md` and `04-elk-fixed-side-ports.md`
  — why `LayoutPort` geometry exists at all, and why only `elkStrategy` writes it.

## Problem

`LayoutStrategy` is `(graph: LayoutGraph) => Promise<LayoutGraph>`, and
`LayoutGraph` carries five optional geometry fields. Only card `x`/`y` are
honoured by every implementation. `LayoutPort.x`/`y` and `LayoutEdge.sections`
are written by `elkStrategy` alone.

This is legal under the current contract: geometry is optional, `gridStrategy`
intentionally places no handles, and the render layer supplies fallbacks. The
open design question is whether those optional capabilities should stay inferred
from output shape or become explicit without making one strategy privileged.

The render layer pays for it with a "which strategy ran?" branch per capability,
written as "which capability landed?" — `projection.ts` falls back to an even
handle spread when no port is placed, and `RoutedEdge.tsx` falls back to a bezier
when an edge has no sections.

`strategy-contract.test.ts` correctly asserts the uniform contract: cards
preserved, positions finite, sizes preserved, edges and ports preserved, no
stacking. It cannot state what an implementation promising optional routed-edge
or placed-port geometry must deliver because no capability is currently declared.

## Issues

- `01` — declare capability rather than inferring it from the output
