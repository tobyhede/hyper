# 01 — Remove elkjs from the repository

Status: ready-for-agent
Blocked by: none

**What to build:** Take elkjs out of the product. No layout strategy backed by it remains and it is not a dependency of any package, while the canvas draws exactly what it drew before — the same positions, the same Edges, the same handles. This is the deletion ADR 0086 decides, and it is deliberately behaviour-preserving: the routed geometry being removed has never rendered in the application, because no surface can select the strategy that produced it.

Take the guidance and guard entries that exist only for elkjs with it. Three of the handle rules in the rendering guidance are elkjs's alone — port offsets driving handle positions, `FIXED_SIDE` over `FIXED_ORDER`, and the per-Thing port id namespacing — and the arguments behind the last two stay tracked under the layout-seam effort for whoever rebuilds this against an Edit.

- [ ] No elkjs-backed layout strategy remains, and elkjs is a dependency of no package.
- [ ] The tracked fixture renders identically: same Thing positions, same Edge paths, same handle placement.
- [ ] The rendering guidance no longer states the three elkjs-only handle rules, and the five React Flow handle rules are unchanged and still stated.
- [ ] The vocabulary guard's exemptions for elkjs's option-bag spellings are gone, along with the filename carve-out for the adapter's elk module. The carve-out for the graph package's own layout module stays — it was never elkjs's.
- [ ] The repository instructions no longer claim elkjs specifics live in the render adapter.
- [ ] `gridStrategy` survives, unused, as the direction that returns.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` green.
