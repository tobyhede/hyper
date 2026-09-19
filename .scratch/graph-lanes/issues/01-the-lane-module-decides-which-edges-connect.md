# 01 — The lane module decides which Edges connect

Status: resolved
Blocked by: none

**What to build:** A prefactor with no visible change. Today ADR 0100's rule — the Active Graph's Edge takes the centre of its pair and connects, the others run beside it and stop short — is split across two modules. The lane module gives the centre to whichever Edge of a pair arrives first, and the Graph Edge projection enforces the rule by building its list with the Active Graph's Edges first. Whether an Edge *connects* is not named anywhere: it is encoded as a trim of zero, and the arrowhead is derived from that number.

Deepen the lane module so it owns the rule. Given the Edges (each with its Graph) and the Active Graph, it answers for each Edge its lane offset and whether it connects. An Edge connects when no Graph is active, or when it is the Active Graph's. The projection calls it once, over the Edges in their own order, and maps "connects" to the trim and the arrowhead. The ordering convention and its "a caller that wants one Edge on the centre puts it first" documentation go.

The decided shape, from the design discussion: `laneOffsets(edges)` is replaced by `graphLanes(edges, activeGraphId)`, whose input Edges carry `id`, `source`, `target` and `graphId`, and which answers a `Map` from Edge id to `{ offset, connects }`.

Paint order is not part of this: the Active Graph's Edges are still drawn last, keyed on the Active Graph rather than on "connects", because while no Graph is active every Edge connects and none should be lifted.

- [x] The lane module answers lane offset and "connects" per Edge from the Edges and the Active Graph; nothing relies on the order the caller passes them in.
- [x] The projection no longer reorders Edges to choose the centre lane.
- [x] The arrowhead and the trim follow "connects"; nothing tests the trim value to decide the arrowhead.
- [x] Paint order still lifts the Active Graph's Edges, and only those.
- [x] The canvas draws exactly what it drew before: existing projection, lane and e2e tests pass unchanged apart from calls to the renamed function.
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` green.

## Answer

`graphLanes(edges, activeGraphId)` replaces `laneOffsets` and answers `{ offset, connects }` per Edge; the projection calls it once over the Edges in their own order and maps `connects` to the trim and the arrowhead. Paint order still keys on the Active Graph. The projection tests passed unchanged, and the lane tests moved onto the new function. Commit `366c2e94` on PR #241.
