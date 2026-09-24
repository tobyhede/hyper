# 05: Extract Command Dock placement geometry

**What to build:** Where the Command Dock can sit and how dragging moves it — slots, edges, positions along an edge, the drag threshold, nearest slot — as a pure module with its own tests. The Dock component consumes it rather than defining it inline.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The geometry module has no React dependency and is unit-tested in Node
- [ ] Dragging and docking behave exactly as before (existing e2e and Ladle proofs unchanged)
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` green
