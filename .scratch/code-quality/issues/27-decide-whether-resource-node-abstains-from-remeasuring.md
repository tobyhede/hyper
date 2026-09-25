# 27 — Decide whether `ResourceNode`'s abstention from `updateNodeInternals` is load-bearing

**What to build:** Establish whether calling `useUpdateNodeInternals` from `ResourceNode` breaks anything today. Then either keep the `ResourceNode handle geometry` tests in `packages/react-flow-adapter/test/ResourceNode.test.tsx` with the evidence named, or delete them.

**Blocked by:** None — can start immediately.

**Status:** needs-triage

**Priority:** P3

**Why:** Two reasons were given for the rule, and neither holds.

- A forced remeasure would drop the declared anchors of Graphs the Resource is not yet on. That stopped being true when `ab39e5ea` (2026-09-11) removed per-Graph handles. Every Resource now renders all four sides in both roles.
- A mid-transition measurement would attach an Edge off-centre. React Flow already takes that measurement: `useResizeObserver` in `@xyflow/react` 12.11.2 calls `updateNodeInternals` with `force: true` on every resize. `updateNodeInternals` in `@xyflow/system` 0.0.79 rebuilds `handleBounds` from `getHandleBounds` whenever a node's size changes, forced or not.

Ticket 10 corrected the comments so they no longer claim either reason. The tests still pin the abstention. Under the comment rule, a decision called load-bearing needs something that fails when it is reversed.

- [ ] Add the hook call to `ResourceNode` on a throwaway branch and run `pnpm e2e` and `pnpm e2e:ladle`. Record what fails, if anything.
- [ ] If something fails, name that test beside the abstention tests. If nothing does, delete the abstention tests and the `updateNodeInternals` mock they need.
