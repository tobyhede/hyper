# Space Thing drag lag: investigation and improvement assessment

Investigated 2026-09-14. Scope: reproduce the reported visual lag, check React Flow best practices, and assess improvements. No production code changed.

## Finding

The small-fixture lag is reproducible and its child-to-parent separation is eliminated by disabling node CSS transitions in the test browser. Hyper gives every Thing wrapper a 200ms transform transition but exempts only wrappers carrying their own `dragging` class. Embedded Things move when their parent moves without receiving that exemption. Their rendered positions ease toward the new coordinates while their parent follows the pointer.

This fits React Flow's documented subflow mechanism: `parentId` children are positioned relative to a parent but are DOM siblings, not its DOM descendants. Hyper uses this single-canvas construction, not a React Flow instance nested inside each Space Thing. [Official subflow guide](https://reactflow.dev/learn/layouting/sub-flows).

Evidence in the repo: [motion styles](../../packages/app/src/styles.css), [embedded node projection](../../packages/app/src/embedded-diagram.ts), and the retained [browser probe](drag.spec.ts).

## Reproduction and controlled comparison

The probe imports the normal E2E fixtures, starts its own isolated Vite/HTTP memory host, selects Linked Spaces, opens Presentation, and drags its title area horizontally in 20 pointer steps. It samples the screen-space horizontal offset of one embedded Thing and one internal Edge relative to the parent on animation frames. A rigid translation should preserve these offsets. The probe fails above 3px drift and separately verifies that the parent really moved over 100px.

The scene has seven mounted React Flow nodes and three Edges. The observed parent movement is 152px in every recorded run. The original scene is intentionally retained because it demonstrates the problem with a small realistic fixture; this investigation did not establish a mathematically minimal node count.

| Condition | Maximum child drift, three runs | Maximum sampled internal Edge drift | Verdict |
| --- | --- | --- | --- |
| Current application CSS | 19.77px, 19.77px, 17.99px | 0px in every run | 3 failed |
| Browser-only node transition override | 0px, 0px, 0px | 0px in every run | 3 passed |

Each test took approximately 3.7–6.7 seconds including setup. An earlier single-run comparison also measured 19.79px versus 0px. The override changes only CSS in the isolated test page; it does not alter projection, authoring, data size or React Flow configuration.

The sampled internal Edge already follows the parent. Therefore the measurement supports a **node/connector geometry mismatch**, not the claim that this connector's update is late. The Edge follows current model geometry while the child DOM is still interpolating. Only one child and one internal Edge are sampled; external connections, every endpoint, vertical drags, deeper embeddings and release-time animation remain follow-up cases.

Reproduce the baseline from the repository root:

```sh
pnpm exec playwright test --config .scratch/space-thing-drag-performance/playwright.config.ts --repeat-each=3
```

Run the comparison:

```sh
DISABLE_TRANSITIONS=1 pnpm exec playwright test --config .scratch/space-thing-drag-performance/playwright.config.ts --repeat-each=3
```

The baseline is deliberately red while the defect exists. These are research probes outside the normal E2E suite, not a new CI gate. Chromium required execution outside the filesystem sandbox because macOS denied its process registration inside it. The existing human fixture server on port 5175 was left untouched.

## Improvement priorities

1. **Make direct manipulation immediate for every affected embedded wrapper.** Preserve the intended Open/Close/displacement animation, but prevent transform interpolation for descendants moving with a dragged ancestor. Do not assume a DOM descendant selector can reach subflow children. The broad override proves the cause; it is not the proposed production fix. Verify parent and child movement, internal and external Edge attachment, clipping, multi-selection, nested descendants, reduced motion, and return to normal animation after release. This has a measured benefit for the small-scene symptom and should come first.

2. **Preserve embedded projection identities during a pure parent translation.** [EmbeddedDiagramAuthoring](../../packages/app/src/components/EmbeddedDiagramAuthoring.tsx) depends on the whole parent node in its publication memo. Dragging replaces that object. [embeddedDiagram](../../packages/app/src/embedded-diagram.ts) uses parent identity, dimensions and stacking rather than its position, yet rebuilds child nodes, data, styles, IDs and Edges. Narrow dependencies to what affects the local projection, preserving numeric clip-bound changes and recursive embedding behaviour. This is the strongest source-backed scaling candidate, but its timing benefit is not measured here. A meaningful verification is that parent translation preserves unchanged embedded node/data/edge references, while parent resize or changed ancestor clipping updates them.

3. **Reduce work performed on every drag publication.** [SpaceCanvas](../../packages/app/src/components/SpaceCanvas.tsx) reconstructs embedding requests from changing root nodes and republishes combined node/edge arrays when embeddings change. Separate stable topology/target lookup from changing geometry where profiling shows a cost. [The render adapter](../../packages/app/src/render-adapter.ts) also builds an after-position Map before checking whether any position changes have settled, although the settled branch is its consumer. Defer this settled-only work. Existing node-change application preserves unaffected node objects; do not replace it with blanket cloning or claim all nodes already rerender.

4. **Benchmark visibility filtering and paint simplification after those changes.** `onlyRenderVisibleElements` adds overhead and is not automatically faster. Compare small mostly-visible Diagrams against large mostly-offscreen ones. Simplify shadows, borders or other paint effects only if a trace identifies paint as the bottleneck. Do not silently hide authored Open Things to achieve a score. [React Flow performance guidance](https://reactflow.dev/learn/advanced-use/performance), [visibility option](https://reactflow.dev/api-reference/react-flow#only-render-visible-elements).

## Best-practice assessment

The app already pins React Flow 12.11.2, which contains recent upstream drag/viewport optimizations; upgrading to that release is not work remaining. Stable component registries and memoized canvas arrays already exist. The relevant remaining question is whether their inputs stay stable during gestures. Follow the guidance to memoize components/props and narrow subscriptions, but measure actual render propagation before adding memoization indiscriminately. [Official performance guide](https://reactflow.dev/learn/advanced-use/performance), [12.11.2 release](https://reactflow.dev/whats-new/2026-07-06).

Do not diagnose broad Edge rerenders merely from `useInternalNode`: the installed implementation selects the requested node with shallow equality, despite broader wording in the API page. Edges whose endpoint geometry changes must update. See the source comparison and fuller official guidance in [the supporting research](react-flow-guidance.md).

## What remains unknown about real-world scale

This proves a visual synchronization defect at small scale. It does not establish a supported maximum Thing count or quantify the proposed projection optimizations. The sampled maximum frame intervals were roughly 40–49ms with normal CSS and 40–41ms with the override. These include setup/interaction scheduling and synchronous geometry reads in a development-mode automated browser; they are not a clean FPS benchmark and do not establish smooth large-scene performance.

The next performance campaign should generate valid aggregate fixtures at 10, 50, 100 and 500 embedded Things, with sparse and dense Graphs, one versus several Open Space Things, and one versus multiple embedding levels. Keep viewport, zoom, drag path, Chromium version and CPU configuration fixed. Measure animation-frame interval distributions, long tasks, scripting/layout/paint time, React commits, projection publication counts and visual alignment separately. Compare each optimization individually, then together, and include a production build before drawing capacity conclusions. Include parent-only, embedded-child and ordinary Markdown Thing drags to separate embedding cost from baseline canvas cost.

Recommended sequence: fix the measured motion mismatch; measure and reduce avoidable embedding publication; then decide on rendering/visibility tradeoffs using scale traces. There is no evidence here requiring replacement of React Flow or conversion to multiple nested canvas instances.

## Implementation outcome

The approved tickets were implemented in this effort. During any live React Flow node drag, the canvas now suspends Thing placement transitions so subflow siblings translate rigidly; normal authored motion resumes after release. Browser application and Ladle coverage observes the parent, embedded Thing and internal connector during the gesture and checks for delayed catch-up.

Embedded projection now depends on the parent properties it actually consumes—identity, dimensions and stacking—so a pure parent translation retains the existing publication. Settled-position comparison work in the render adapter is also deferred until a gesture actually settles.

The reusable benchmark and its recorded development and production smoke results are documented in `scripts/space-thing-drag-benchmark/README.md`. The smoke comparison suggests lower scripting work after retaining the projection, but the trial count and run order do not justify a stable percentage claim. The benchmark is the retained mechanism for larger-scale measurement.

The regression samples every visible descendant whose recursive placement id contains the dragged parent's id, so the generated second embedding level is part of the alignment measurement. Multi-selection is deliberately absent from the application interaction model: `edge-authoring-react.tsx` supplies `multiSelectionKeyCode: null`, `SpaceCanvas` disables the selection key too, and application selection stores one `selectedThingId`. There is therefore no supported multi-node parent drag to preserve. The Ladle proof now also samples the target endpoint of an external Edge incident to the dragged Space Thing, independently of the internal embedded Edge.
