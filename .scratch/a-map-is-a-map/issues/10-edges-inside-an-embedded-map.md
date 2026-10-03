# 10: Edges inside an embedded Map

**What to build:** An author editing an embedded Map selects and deletes its Edges and chooses an Edge's other end through Connect to Resource, as on the canvas. A connection between Resources in two different drawings is refused with wording, because an Edge joins Resources in one Space.

**Blocked by:** 07.

**Status:** ready-for-agent

**Spec:** `.scratch/a-map-is-a-map/spec.md`. **Decision:** ADR 0112.

- [ ] An embedded Map's Edges are selectable, focusable and deletable in Edit, with the same confirmation and outcomes as on the canvas.
- [ ] Connect to Resource offers only Resources of the selection's occurrence, and a choice continues at the new Edge in that drawing.
- [ ] A drag between Resources of two drawings is refused with wording, shown like any other connection refusal; no refusal is dropped silently.
- [ ] Inert and read-only Maps withhold Edge authoring exactly as the policy says.
