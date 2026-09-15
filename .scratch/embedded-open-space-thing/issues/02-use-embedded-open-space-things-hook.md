# 02 — useEmbeddedOpenSpaceThings hook

**What to build:** Target-read scheduling, embed failures, and the publication registry move into `useEmbeddedOpenSpaceThings`. The canvas receives requests, publications, failure messages, and resume helpers from the hook instead of owning that state and those effects. Nested embed discovery continues to work because publications and BFS stay in one lifecycle home. The thin `use-embedded-diagram` memo wrapper is removed; callers use `embeddedDiagram()` directly.

**Blocked by:** 01 — Pure embedded discovery and bounds

**Status:** resolved

- [x] Hook owns `embeddedPublications`, target-read `requested` tracking, `resumeEmbedded`, and surfaced embed failure messages — same scheduling semantics as before extraction.
- [x] Hook composes the pure discovery and bounds functions from ticket 01 with live node/publication inputs.
- [x] `SpaceCanvas` delegates embed lifecycle to the hook; mounting `EmbeddedDiagramAuthoring` and clip-path wiring stay in the canvas layer.
- [x] `use-embedded-diagram.ts` is deleted with no behaviour loss.
- [x] `pnpm verify` passes; existing Space Thing embedded-diagram unit and application proofs stay green.
