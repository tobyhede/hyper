# 02 — An Active Graph holding both directions of a pair splits the centre

Status: ready-for-agent
Blocked by: 01

**What to build:** A defect fix. Lanes bundle Edges by their unordered pair of Things, so an Edge and its reverse share a bundle. A Graph may hold both A → B and B → A (ADR 0032), and when that Graph is active the second of them lands one lane out while still connecting and carrying an arrowhead — an Active Graph Edge drawn off the centre, with its Edge controls off-centre too. No test covers it.

A Graph holds at most one Edge per ordered pair (intake refuses duplicates), so the Active Graph has zero, one or two Edges in any pair, and at most one self-Edge per Thing. The decided layout:

- One Active Graph Edge in the pair sits on the centre, as today.
- Two — both directions — sit half a lane spacing either side of the centre, and both connect with arrowheads. The one whose source sorts first (the same ordering that keys a pair) takes the negative side. The choice needs no geometry; the arrowheads say which way each goes.
- Every other Graph's Edge in the pair stacks one spacing past the outermost Active lane, on the same side as today (below a level pair, right of a stacked one). With a split pair the first sits at one and a half spacings.
- Where the Active Graph has no Edge in the pair, the first other Graph's Edge takes the centre, as today.

Lane offsets can now be negative; drawing already moves an anchor either way along its side. A self-Edge never splits, so its lanes stay nonnegative.

Amend ADR 0100 in place (it is new and unmerged): the Active Graph's Edges are centred on the anchors, and a Graph holding both directions splits the centre.

- [ ] Red first: a projection test for an Active Graph holding both directions of a pair fails on the code as 01 left it, then passes.
- [ ] Both Active Edges of a two-way pair connect, carry arrowheads, are untrimmed, and sit either side of the centre by half a spacing; the source-sorts-first Edge takes the negative side.
- [ ] Another Graph's Edge in that pair sits one and a half spacings out, trimmed, with no arrowhead.
- [ ] Lane module tests cover a split pair, a lone Active Edge, a pair with no Active Edge, and no Graph active.
- [ ] ADR 0100 states the two-way case.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` green.
