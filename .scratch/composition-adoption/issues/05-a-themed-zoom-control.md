# 05 — A themed zoom control on the canvas

**What to build:** The canvas's zoom and fit controls look like the rest of the application. Today the canvas mounts React Flow's own control cluster, which is the library's default presentation dropped into a dark application, and it is the one piece of canvas chrome that never went through the shadcn-first route because it arrived with the library rather than being built.

**Blocked by:** 01. The registry the replacement comes from has to be declared before the search step can find it.

**Status:** ready-for-agent

- [ ] The decision is taken the ADR 0047 way and recorded: search this repo's own package first, then the registry now reachable under the declared namespace, and hand-roll only as the last option. The registry ships a zoom control; if it is taken, say so, and if it is refused, the reason is written before anything is hand-rolled.
- [ ] Whatever the canvas ends up mounting is themed with the application's tokens and readable against the dark canvas, and the interactive control it composes comes from this repo's package rather than being reimplemented — the registry component's own dependency on a slider resolves through the shadcn manifests to the Base UI primitive, per ADR 0050, and a slider primitive that does not exist here yet is generated the same way every other one was.
- [ ] Zooming in, zooming out and fitting the view all still work, and the control does not shadow the canvas's own keyboard commands — issue 02's list gains any binding it introduces.
- [ ] ADR 0052's two proofs are paid: a Ladle story and an application proof, or an entry in the design-system inventory with its reason. A new component in the scanned source trees fails the catalogue check until one of those exists.
- [ ] The control does not fight the Sidebar for stacking. The Sidebar's desktop container is fixed and above the canvas, and the canvas chrome that came before this had to learn that.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` are green and reported.

## Not in scope

A minimap change. The heads-up display in the adapter is a separate surface with its own reasons, and it is deliberately beyond what the registry ships.
