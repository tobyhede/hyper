# 02 — Narrow the LayoutStrategy contract to what a Diagram can hold

Status: ready-for-agent
Blocked by: 01

**What to build:** Remove the routing half of the strategy contract. A Diagram stores placements — a Thing and its position — and nothing else, so routed Edge geometry can never be persisted by an Edit and can no longer be produced at render. It is unusable in both directions rather than merely unused, which is the argument ADR 0086 makes for deleting it rather than leaving it for a future automatic arrangement.

The even spread of a Thing's per-Graph ports over its height stops being a fallback for a strategy that never placed them and becomes the only rule. Behaviour does not change: the fallback is already the only branch that executes.

- [ ] The strategy contract describes positions only — no port collection on a Thing, no routed sections on an Edge, and no section type on the package surface.
- [ ] The graph package's curated index and the surface test that gates it no longer name the removed types.
- [ ] The routed-Edge component draws one curve between its anchors, with no polyline branch and no routed-point flattening behind it.
- [ ] Handle offsets come from the even spread alone, with no lookup that can override it.
- [ ] The canvas projection no longer special-cases a moved Thing when building Edge options; it built two identical results.
- [ ] The tracked fixture renders identically.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` green.
