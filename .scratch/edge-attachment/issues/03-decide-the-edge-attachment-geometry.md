# 03 — Decide and record the Edge attachment geometry

Status: resolved
Blocked by: 02

**What to build:** Answer the question ADR 0086 deliberately leaves open, against the tree the deletion leaves rather than the one that preceded it.

Today every Edge leaves a Thing's right side and enters the next one's left. What 01 removes is the *argued* cause — the mapping of a handle to an elkjs port side. The rule itself stays, stated without an argument and untouched by either 01 or 02, in `projection.ts` (`position: Position.Left` on every per-Graph target handle, `Position.Right` on every source) and again at render in `ThingNode.tsx`. So after 01 and 02 nothing says *why* an Edge attaches where it does while three places still say *that* it does, and amending those three is part of this ticket rather than something the deletion already did. The per-Graph in/out handle ids survive on React Flow's grounds, its warning #008; their placement survives on none.

The decision is which anchor set an Edge attaches to, where the geometry is computed, and whether the per-Graph port family survives at all now that the four Active-Graph-coloured authoring handles are the only other handles in the tree. Reassess rather than inherit: the case made before the deletion leaned on machinery this effort removes.

- [ ] An accepted ADR answers all three: anchor set, where the geometry is computed, and the fate of the per-Graph port family.
- [ ] The three surviving `Position.Left`/`Position.Right` declarations are amended to agree with it, so the declared handle `position` and the drawn geometry cannot disagree.
- [ ] It states which React Flow handle rules constrain the answer, in particular that handle geometry is declared and never re-measured and why the documented `useUpdateNodeInternals` remedy is wrong here.
- [ ] It says what happens when several Graphs cross one pair of Things, and what a self-Edge draws.
- [ ] It records what it supersedes or amends in the handle-scheme line that runs through the superseded record, and in ADR 0033's division between the authoring handles and the attachment geometry.
- [ ] It states whether a drag recomputes attachment, and if so where — the projection does not re-run while a pointer is down.
- [ ] `CONTEXT.md` is read and changed only if a term actually moves. Its render-layer Handle entry already licenses invisible attachment geometry that the model does not obey.

## Answer

ADR 0087. A Thing has four Edge anchors, one per side, and they are the handles the authoring gesture already uses. An Edge attaches to the anchor on the side facing the other Thing. The per-Graph `<graphId>::in` / `::out` family goes, along with `buildThingHandles`, `filterHandlesByGraphs`, `resolveHandles`, `GraphRenderHandleRef`, and `LayoutStrategyEdge`'s `sourceHandle` and `targetHandle`, which `02` parked here.

Anchor and affordance split. Anchors always render, because a Thing in an embedded Diagram draws Edges while `readOnly` and `connectionAuthoringEnabled: false` withhold the controls, and the per-Graph ports are what serve that today. The Active Graph colour and the pointer targets stay the authoring layer over them, exactly as ADR 0033 has them.

The side is chosen while the Edge is drawn, by a small edge component reading both positions from React Flow's store — not in the projection, which does not run again during a drag, so a projected side is right only after release. The rule itself stays pure: two rects in, a side out, tested in the node environment.

Four anchors rather than a sliding one, for a reason beyond simplicity: a continuous anchor is a property of a pair and cannot be a declared handle, while four are properties of one Thing and stay ordinary declarations, so declared-never-remeasured keeps holding. React Flow's own example is also wrong here — it derives both centres from one node's half-size, which breaks for a 960x720 Space Thing beside a 260x146 collapsed one.

A self-Edge takes a fixed loop before the general rule, since the facing-side rule divides by a zero vector for one Thing and React Flow draws a NaN path as nothing.

Accepted cost, stated rather than discovered: several Graphs between one pair of Things now draw one line over another. Colour and the Active Graph's emphasis are what separate them. Fanning by curvature is available later, against the overview, and is not this decision.
