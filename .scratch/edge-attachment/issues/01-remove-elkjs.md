# 01 — Remove elkjs from the repository

Status: resolved
Blocked by: none

**What to build:** Take elkjs out of the product. No layout strategy backed by it remains and it is not a dependency of any package, while the canvas draws exactly what it drew before — the same positions, the same Edges, the same handles. This is the deletion ADR 0086 decides, and it is deliberately behaviour-preserving: the routed geometry being removed has never rendered in the application, because no surface can select the strategy that produced it.

Take the guidance and guard entries that exist only for elkjs with it. Three of the handle rules in the rendering guidance are elkjs's alone — port offsets driving handle positions, `FIXED_SIDE` over `FIXED_ORDER`, and the per-Thing port id namespacing — and the arguments behind the last two stay tracked under the layout-seam effort for whoever rebuilds this against an Edit.

- [x] No elkjs-backed layout strategy remains, and elkjs is a dependency of no package.
- [x] The tracked fixture renders identically: same Thing positions, same Edge paths, same handle placement.
- [x] The rendering guidance no longer states the three elkjs-only handle rules, and the four React Flow handle rules are unchanged and still stated, under ADR 0033's scoping lead-in that the guidance counts them below.
- [x] The vocabulary guard's exemptions for elkjs's option-bag spellings are gone, along with the filename carve-out for the adapter's elk module. The graph package's own layout module is untouched: what protects it is the *shape* carve-out for the `LayoutStrategy` compound, not a filename entry, and it never had one.
- [x] The repository instructions no longer claim elkjs specifics live in the render adapter.
- [x] `gridStrategy` survives, unused, because it is pure and costs nothing and keeps the contract honest — not as a privileged strategy or a preferred return direction.
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` green.

## Answer

elkjs is out of the tree. `packages/react-flow-adapter/src/elk/` and its test are deleted, the dependency is gone from `packages/react-flow-adapter/package.json` and the lockfile, and the barrel no longer re-exports it. Nothing outside the deleted tests imported it, and the application constructs only `positionedStrategy`, so the change is behaviour-preserving by construction — the routed geometry that left had never rendered.

Two things are deliberately *not* done here and belong to later tickets. Ticket 02 still owns the contract narrowing: `sections`, `ports`, `portsById`, `RoutedEdge`'s polyline branch and `canvas-projection.ts`'s `moved` special case are all still in the tree, and ADR 0086's "What this deletes" now labels which ticket owns each bullet rather than reading as finished work. Ticket 03 still owns the attachment geometry, and its premise has been corrected: the deletion removed the *argued* cause of left/right attachment, not the rule — `projection.ts` and `ThingNode.tsx` still declare `Position.Left`/`Position.Right`, and amending them is 03's work.

The handle-rule count is reconciled at four rather than five. Exactly the three elkjs rules were removed and no React Flow rule was lost; the fifth survivor counted by ADR 0086 is ADR 0033's scoping lead-in, which is not a React Flow rule, so the guidance's "four handle rules below" and this criterion now agree.

`pnpm verify` (196 files, 2445 tests), `pnpm e2e` (180) and `pnpm e2e:ladle` (83) all green.
