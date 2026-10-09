# 05: One policy decides authoring, inert and read-only

**What to build:** Every drawn Map carries one policy — authoring, inert or read-only — computed once as the lower of an inherited ceiling and its local Read or Edit state, and everything that gates authoring reads it. Edit is offered only on a Space Resource in the canvas's own Map. A drawn Map never contains its own Map.

**Blocked by:** 01.

**Status:** resolved

**Spec:** `.scratch/a-map-is-a-map/spec.md`. **Decision:** ADR 0112.

- [x] Read-only has exactly two sources: shown through a Reference Resource, or the Space is stale or retained, which draws its last working state with its own status.
- [x] The ceiling only restricts: read-only passes to every Map drawn inside, and every Map below the first embedded level is inert at most.
- [x] Edit is offered only on a Space Resource in the canvas's own Map; an authoring embedded Map can still open, close and move its own Space Resources, and what they draw is inert.
- [x] Node interactivity, the Resource's read-only flag, the rail's offers and availability all derive from the policy, and no separate read-only check remains; a Reference embedding's Resources are read-only like any other.
- [x] The nesting walk starts with the canvas's own Space and Map on its path, so a Map that shows itself is drawn as a closed window.
- [x] A test enumerates, per policy, what a drawn Map offers.

## Answer

One surface policy combines the inherited ceiling, reference/stale state, depth and local Edit state. Shared availability further restricts transient gestures without changing that policy. The nesting path starts at the canvas Map; second-level Maps remain inert. Policy enumeration and application nesting tests cover these boundaries.

Delivered by PR #332, merged 2026-10-04 with its CI gate green. The 2026-10-08 closeout verification, and the tests it added in PR #346, are recorded in `implementation-review.md`.
