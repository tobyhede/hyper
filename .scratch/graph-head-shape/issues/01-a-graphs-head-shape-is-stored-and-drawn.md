# 01: A Graph's head shape is stored and drawn

**What to build:** A Graph document may carry a head shape — `arrow`, `vee`, `dot` or `diamond` (ADR 0105). Every gesture that creates a Graph writes `arrow`: a new Space, first-load initialization of a mapless Space, Add Map and Add Graph. The canvas draws each Graph's head shape at the head of every drawn Edge, in the Graph's colour and at the Edge's opacity — the connecting Edge at its anchor, and an Edge that stops short (ADR 0100) at the end of its drawn line. A Graph with no stored head shape draws as `arrow`. The four shapes are drawn in one place so the legend mark (03), the Shape… menu (02) and the connection preview (04) reuse them rather than redrawing them. React Flow offers only `Arrow` and `ArrowClosed`, so the shapes are this repo's own markers.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] The Graph schema accepts an optional head shape from the closed set of four and refuses any other value.
- [x] New Space, first-load initialization, Add Map and Add Graph each store `arrow` on the Graph they create.
- [x] A Graph with no stored head shape draws as `arrow`.
- [x] Each drawn Edge ends in its Graph's head shape, including a non-active Graph's Edge that stops short, whose shape sits at its trimmed end.
- [x] Two Graphs with different head shapes between the same pair of Resources are distinguishable with colour removed (e.g. a fixture holding a `dot` and a `diamond` Graph).
- [x] The head shape survives persistence (PostgreSQL and SQLite contract) and the CLI aggregate round trip.
- [x] `CONTEXT.md`'s head shape and ADR 0105 describe what was built; ADR 0100's refinement note stays accurate.
