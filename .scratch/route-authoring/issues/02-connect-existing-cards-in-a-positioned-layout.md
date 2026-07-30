# 02 — Connect existing Cards in a positioned Layout

**What to build:** Let an author working in a positioned Layout draw a directed Edge between existing Cards and persist the complete resulting Space. The interaction uses four contextual spatial handles coloured as the active Route, keeps existing Routes visible, and advances authoring focus to the target Card.

**Blocked by:** 01 — Route intake permits cycles and enforces Edge-set uniqueness.

**Status:** ready-for-agent

- [ ] A hovered or selected Card shows four small circular source handles, one centered on each side.
- [ ] Every source handle uses the active Route's colour.
- [ ] Starting a connection reveals four target handles on every Card, including the source Card.
- [ ] The connection preview uses the active Route's colour and an arrowhead.
- [ ] Dragging from Card A to a target handle on Card B adds `A → B` to the active Route.
- [ ] Dropping on the source Card authors a self-edge.
- [ ] Drawing an Edge that closes a cycle succeeds.
- [ ] Drawing an exact Edge already present on the active Route is a no-op: it advances no completed-Edit revision and submits no persistence.
- [ ] The same Card pair can be connected on a different active Route.
- [ ] A successful connection selects the target Card without opening its content, leaving its source handles visible for continued authoring.
- [ ] All Layout-visible Routes remain rendered; the active Route is emphasized and inactive Routes are dimmed.
- [ ] Changing the active Route changes emphasis and authoring-handle colour without filtering or persisting.
- [ ] Existing Edge lines do not show permanent endpoint dots or expose overview attachment geometry as authoring controls.
- [ ] The completed Edge stores only source and target Card ids; chosen handle sides are not authored.
- [ ] A pure completed-connection operation computes and validates the complete next Space snapshot before the imperative shell updates editor, renderer and session collaborators.
- [ ] A successful connection updates the current Layout in place, retains its Route filter, writes its active Route explicitly, and submits exactly one complete snapshot through the existing session.
- [ ] Intermediate and cancelled React Flow connection state never becomes a shared Draft or persistence write.
- [ ] Unit tests cover complete snapshot composition, duplicate no-op, cycle/self-edge support, Layout preservation and unrelated authored data preservation.
- [ ] Playwright proves the visible handles, connection gesture, target selection, resulting Edge and automatic persistence in a positioned Layout.
- [ ] Imported fixture source bytes remain unchanged after the structural Edit.
- [ ] `pnpm verify` and `pnpm e2e` pass.
