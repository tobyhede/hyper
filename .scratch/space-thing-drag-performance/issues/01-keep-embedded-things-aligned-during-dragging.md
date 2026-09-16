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
