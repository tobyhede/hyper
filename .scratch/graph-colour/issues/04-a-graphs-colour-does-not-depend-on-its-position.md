# 04 — A Graph's colour does not depend on its position

Status: needs-triage

**What's wrong:** `graphColorsByGraphId` (`packages/graph/src/graph-color.ts`) draws a Graph with no stored `color` as `GRAPH_PALETTE[index % length]`, where `index` is the Graph's position in the Space's `graphs` array — not even within its own Map. Reordering Graphs or deleting an earlier one therefore recolours any Graph without a stored colour. Every creation path already stores a colour through `nextGraphColor`, so only documents the app did not author (hand-written fixtures, imports) reach this fallback.

**Decision needed:** A Graph's colour should not depend on its position. The likely answer is making `color` required in `graphSchema` and rolling fixtures, seeds and aggregate test documents forward in one change (ADR 0054), which removes the fallback outright. ADR 0105 stores `headShape` the way colour is stored today, so whatever is decided here should be decided for both properties together.

Raised while grilling Graph head shapes (ADR 0105).
