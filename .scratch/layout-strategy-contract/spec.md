# What the LayoutStrategy seam actually guarantees

Source: `/improve-codebase-architecture` review, 2026-08-04.

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
