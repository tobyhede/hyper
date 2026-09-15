# 01 — Pure embedded discovery and bounds

Status: resolved

**What to build:** Open Space Thing embed discovery and bounds/inset math live in one pure module (`embedded-open-space-thing.ts`), exported for node tests and consumed by the canvas. BFS over nested Open Space Things, parent clip intersection, and footer inset from a `bodyHeights` input produce the same `EmbeddedRequest` list the canvas draws today — behaviour unchanged, logic no longer inline in `SpaceCanvas`.

**Blocked by:** None — can start immediately.

- [x] Pure functions discover nested embed requests from the current node tree and publication snapshot, with cycle guarding unchanged from today.
- [x] Pure function computes embed bounds and inset (footer height from `bodyHeights`, parent clip) separately from BFS so bounds bugs are testable in isolation.
- [x] Node unit tests cover cycle guard, footer inset, and clipped bounds without mounting React.
- [x] `SpaceCanvas` calls the pure module for discovery and bounds; existing embedded-diagram application and Ladle proofs stay green with no assertion churn.
