# 01 — Keep embedded Things and connectors aligned during dragging

**What to build:** Dragging an Open Space Thing moves its embedded Things and Graph connectors immediately with it, preserving their visual alignment throughout the gesture and after release. Retain the intended animation for authored Open, Close and displacement operations.

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] Promote the investigation's browser reproduction into regression coverage and demonstrate its failure before changing production behaviour. The measured baseline showed approximately 18–20px of child drift during a 152px parent drag; the browser-only transition override eliminated that drift.
- [x] During horizontal and vertical parent dragging, embedded Things preserve their screen-space offsets from the parent within a small explicit tolerance. Assert actual parent movement so an unperformed drag cannot pass.
- [x] Internal Graph connectors stay attached to their moving Things. Connections incident to the dragged Space Thing remain attached as well. Measure visual geometry during the gesture, not only settled coordinates.
- [x] Moving descendants of a dragged ancestor do not interpolate toward stale positions across multiple embedding levels, accounting for React Flow subflow children being DOM siblings rather than descendants of the parent wrapper. Multi-selection is out of scope for this single-ancestor drag scenario.
- [x] Direct dragging of an embedded Thing remains immediate and authors its settled position in the target Diagram. Dragging the containing Space Thing does not author movement in its target Space.
- [x] Clipping continues to track the moving content, release causes no delayed catch-up or jump, and a subsequent drag behaves correctly.
- [x] Open, Close, Resize and authored displacement retain their intended motion outside direct manipulation. Reduced-motion behaviour remains effective. The investigation's global transition override is diagnostic evidence, not the production treatment.
- [x] Follow shadcn-first-ui for production surface changes and retain React Flow's existing interaction model. Application and Ladle evidence covers the movement behaviour, with the relevant verification and browser suites passing.

## Comments

**2026-09-18 — code-review follow-up (standards vs `47c4d13e`).** Negative results and measurements taken out of source comments. They are reports, not current guidance; re-run before treating them as settled.

### Measurements (method gone; not re-run here)

At 1° about the centre of a Space Thing the size of the fixture's, far corners of the upright embedded canvas sat about ten pixels out of the leaned frame. That figure was written into `CanvasThing.tsx`, `styles.css`, and `docs/agents/rendering.md` without a bench. Removed from source.

### Tried X, it broke Y

These were source comments that named a rejected alternative as if it were decided. The current rule lives in `docs/agents/rendering.md`; this is the report that produced it.

1. **Projection node's `dragging` flag as the set of Things being moved.** `reconcile` rebuilds each node from `canvasProjection` and splices back only the live position, so the flag is absent for most frames of a drag.
2. **Adapter `dragOrigins` as that set.** Durable, but filled from the first `position` change React Flow reports, which arrives a frame after React Flow has already moved the Thing — the frame would lean one frame before the canvas inside it. `SpaceCanvas` reads `nodeLookup` instead.
3. **A CSS transform on `.rf-thing-node__inner`.** The four authoring handles are siblings of the Thing inside that element. React Flow's `getHandleBounds` measures each with `getBoundingClientRect`, which an ancestor transform pollutes; it re-measures only when `offsetWidth`/`offsetHeight` change, and a transform never changes those, so a corrupt bound is silent and outlives the gesture. Lean the Thing, not the inner wrapper.
4. **`@xyflow/system`'s `getEdgePosition` as the reason Edges follow a moved position.** The claim about that module had no test that calls it. What we hold is `leaves the Edges to React Flow, which draws them from the positions that moved` in `embedded-diagram.test.ts`: the Edge list carries no transform.
5. **Handle re-measure on transform** (same as 3) was also written as a claim about React Flow in `styles.css`, `ThingNode.tsx`, and `leanedClipPath`. No unit test can reverse it — jsdom reports `offsetWidth` 0 — so it stays here rather than as a tautological comment-legalizing test.
