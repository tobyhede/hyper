# 02 — Connect existing Cards in a positioned Layout

**What to build:** Let an author working in a positioned Layout draw a directed Edge between existing Cards and persist the complete resulting Space. The interaction uses four contextual spatial handles coloured as the active Route, keeps existing Routes visible, and advances authoring focus to the target Card.

**Blocked by:** 01 — Route intake permits cycles and enforces Edge-set uniqueness.

**Status:** resolved
Tags: release/v1

- [x] A hovered or selected Card shows four small circular source handles, one centered on each side.
- [x] Every source handle uses the active Route's colour.
- [x] Starting a connection reveals four target handles on every Card, including the source Card.
- [x] The connection preview uses the active Route's colour and an arrowhead.
- [x] Dragging from Card A to a target handle on Card B adds `A → B` to the active Route.
- [x] Dropping on the source Card authors a self-edge.
- [x] Drawing an Edge that closes a cycle succeeds.
- [x] Drawing an exact Edge already present on the active Route is a no-op: it advances no completed-Edit revision and submits no persistence.
- [x] The same Card pair can be connected on a different active Route.
- [x] A successful connection selects the target Card without opening its content, leaving its source handles visible for continued authoring.
- [x] All Layout-visible Routes remain rendered; the active Route is emphasized and inactive Routes are dimmed.
- [x] Changing the active Route changes emphasis and authoring-handle colour without filtering or persisting.
- [x] Existing Edge lines do not show permanent endpoint dots or expose overview attachment geometry as authoring controls.
- [x] The completed Edge stores only source and target Card ids; chosen handle sides are not authored.
- [x] A pure completed-connection operation computes and validates the complete next Space snapshot before the imperative shell updates editor, renderer and session collaborators.
- [x] A successful connection updates the current Layout in place, retains its Route filter, writes its active Route explicitly, and submits exactly one complete snapshot through the existing session.
- [x] Intermediate and cancelled React Flow connection state never becomes a shared Draft or persistence write.
- [x] Unit tests cover complete snapshot composition, duplicate no-op, cycle/self-edge support, Layout preservation and unrelated authored data preservation.
- [x] Playwright proves the visible handles, connection gesture, target selection, resulting Edge and automatic persistence in a positioned Layout.
- [x] Imported fixture source bytes remain unchanged after the structural Edit.
- [x] `pnpm verify` and `pnpm e2e` pass.

## Answer

Implemented existing-Card Route authoring for positioned Layouts. Four contextual,
route-coloured spatial handles drive a directed React Flow connection whose preview
uses the same colour and an arrowhead. A successful gesture composes and validates
one complete `SpaceSnapshot`, updates only the active Route and selected Layout,
submits it through the existing session, and advances focus to the target without
opening it. Existing overview attachment geometry remains measurable but invisible.

Exact duplicates return no completed Edit and do not submit. Pure public tests cover
duplicate, cycle, self-edge, cross-Route, Layout-filter and unrelated-data behavior;
Playwright covers the rendered gesture, target focus, route switching without
persistence, and import-only fixture bytes. Algorithmic-View conversion, Route
minting and empty-canvas Card creation remain with Issues 03–05.
