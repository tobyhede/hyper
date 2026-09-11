# 03 — Decide and record the Edge attachment geometry

Status: ready-for-agent
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
