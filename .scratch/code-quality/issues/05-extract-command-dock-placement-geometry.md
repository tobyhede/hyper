# 05: Extract Command Dock placement geometry

**What to build:** Where the Command Dock can sit and how dragging moves it — slots, edges, positions along an edge, the drag threshold, nearest slot — as a pure module with its own tests. The Dock component consumes it rather than defining it inline.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] The geometry module has no React dependency and is unit-tested in Node (`packages/app/src/dock-placement.ts`; `packages/app/test/dock-placement.test.ts`, with `dock-geometry`, `dock-slots` and `dock-orientation` now importing from it)
- [ ] Dragging and docking behave exactly as before (existing e2e and Ladle proofs unchanged) — pending coordinator e2e run; no e2e or Ladle proof was edited
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` green — `pnpm verify` run on the finished branch; e2e and Ladle pending coordinator e2e run
