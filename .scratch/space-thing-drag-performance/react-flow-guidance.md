# React Flow guidance for Space Thing drag performance

Investigated 2026-09-14. This is supporting research, not a runtime diagnosis. No production changes were made.

## Version and upstream baseline

Both the app and render adapter pin `@xyflow/react` to **12.11.2**; the installed package matches. React is declared as `^18.3.1`. React Flow 12.11.2 already incorporates three relevant improvements: avoiding drag instances for non-draggable nodes, avoiding MiniMap rerenders on every store update, and applying viewport transforms imperatively. Its system package also caches the zoom-pane extent to avoid synchronous layout during pan/pinch. Upgrading to this version is therefore not an outstanding improvement here. [Official 12.11.2 release notes](https://reactflow.dev/whats-new/2026-07-06).

## Guidance applicable to this investigation

React Flow recommends stable component types, memoized callbacks and object props, narrowly scoped subscriptions instead of consuming whole node/edge arrays, and reducing expensive styling when profiling identifies rendering cost. Its collapse/hidden-node suggestion is relevant to scale, but cannot silently replace this product's authored Open state or required visible content. [Official performance guide](https://reactflow.dev/learn/advanced-use/performance).

The installed renderer deliberately separates the list of node IDs from each node wrapper. A position change should not force the entire node-list mapping to rerun. Individual wrappers subscribe to their node and render with its current absolute position. Hyper should preserve node/data identities for unaffected entities rather than defeating that isolation with broad application publication. This is an investigation target, not evidence that all wrappers currently rerender. [Official NodeRenderer implementation](https://raw.githubusercontent.com/xyflow/xyflow/main/packages/react/src/container/NodeRenderer/index.tsx); also checked against installed 12.11.2 `dist/esm/index.mjs`, `NodeRendererComponent` and `NodeWrapper`.

`onlyRenderVisibleElements` is opt-in and defaults to false. The documentation explicitly notes that visibility filtering adds overhead. Benchmark it against both mostly visible small diagrams and mostly offscreen large diagrams; it is not an automatic fix. [ReactFlow API](https://reactflow.dev/api-reference/react-flow#only-render-visible-elements).

`useReactFlow()` can query current state without subscribing to every state change. This is appropriate for event-time reads; live geometry still requires reactive updates. [useReactFlow API](https://reactflow.dev/api-reference/hooks/use-react-flow).

## Important distinction: subflows versus nested canvases

React Flow `parentId` makes a child position relative to a parent, but **does not nest its DOM inside the parent's node element**. Parent movement updates the child positions too. Therefore a parent transform is not sufficient to visually translate all children as one browser subtree, and the parent's CSS drag state is not inherited by sibling node wrappers. [Official subflow guide](https://reactflow.dev/learn/layouting/sub-flows).

Separate React Flow instances are a different construction. Official guidance requires a separate provider for each flow on the same page. Do not assume that guidance applies to Hyper's embedded Things without first identifying whether they are sibling projected nodes, `parentId` children, or independent nested instances. [ReactFlowProvider notes](https://reactflow.dev/api-reference/react-flow-provider#notes).

## A documentation discrepancy to avoid

The current `useInternalNode` API prose says that any node change rerenders its consumer. However, its linked official source selects `nodeLookup.get(id)` and uses shallow equality. The installed 12.11.2 implementation does the same. Consequently the safe version-specific conclusion is that a changed selected internal node can rerender the subscriber; it is **not** established that every unrelated node movement rerenders all subscribers. [API prose](https://reactflow.dev/api-reference/hooks/use-internal-node), [linked official implementation](https://github.com/xyflow/xyflow/blob/main/packages/react/src/hooks/useInternalNode.ts).

Hyper's `useEdgeAttachment` subscribes to its two endpoint nodes through this hook. That is expected for geometry that changes during dragging. Narrower rectangle selectors may reduce non-geometric updates, but they do not eliminate the necessary updates when an endpoint moves. Treat any claim of a large win as unproven until profiled.

## CSS lag versus computation lag

Local inspection found that `.graph-area` sets `--thing-placement-duration: 200ms`, and `.rf-thing-node` transitions width, height, and transform. Only a node wrapper carrying its own `dragging` class receives `transition: none` in the current rule. Installed React Flow `NodeWrapper` computes that class from its `useDrag` result and renders its wrapper with an absolute-position translation.

**Hypothesis:** a projected child that moves because its containing Space Thing moves, while lacking its own `dragging` class, can retain the 200ms transform transition. It can then visibly trail its container even when JavaScript completes every frame. Edge geometry may use the latest model coordinates while the DOM is between transition endpoints, producing an apparent separation or chase. This needs browser measurement of computed styles, positions and SVG paths; it is not established merely by reading the stylesheet. CSS duration explicitly controls how long a property takes to reach its new state. [MDN transition-duration](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/transition-duration).

A useful A/B probe is a temporary browser-only transition override applied to all moving projected node wrappers. Compare the child-to-container visual offset and connector attachment errors, separately from frame times. If offsets disappear while scripting time stays similar, there are two different issues: motion treatment caused the visual lag, and computation may still constrain large diagrams.

## Suggested measurement order

1. Record a repeatable drag with a small embedded Diagram. Sample container and embedded-node screen offsets, computed transitions, SVG attachment positions and frame intervals. Confirm which rendering construction Hyper uses.
2. Repeat with only motion transitions suppressed, retaining the same nodes, edges and actions. This isolates intentional interpolation from slow computation.
3. Profile increasing embedded Thing counts and Graph densities. Count render-adapter publications, projection work, node component renders and edge geometry renders. Separate scripting, layout and paint cost.
4. Test preserving unaffected node/data/callback identities and separating drag updates from unrelated chrome subscriptions where profiles show fan-out. Existing stable type registries already satisfy one upstream recommendation.
5. Evaluate viewport filtering and simplified paint only after the small-example lag is explained. Report the crossover point and behavioral limitations, rather than assuming benefits at every diagram size.

The most promising first check is therefore **movement-transition scope**, followed by **publication and identity stability at scale**. Nothing in the upstream sources establishes that replacing React Flow or introducing another state library is necessary.

## Concrete scaling candidates from Hyper source

These are code-backed work counts and hypotheses, not measured timing claims:

- `render-adapter.ts`'s `changeNodes` builds an ownership Set, before-position Map, selection pass and after-position Map for each relevant batch. The after-position Map is constructed even when there are no settled changes, although only the settled branch consumes it. Deferring settled-only work is a small, low-risk candidate. `applyNodeChanges` and `withSelection` already preserve unchanged node objects; avoid claiming every node is cloned here.
- `SpaceCanvas.tsx` rebuilds `embeddedRequests` whenever the root nodes array changes. This traverses projected descendants, recomputes bounds and searches working Things and Open Spaces for each open Space Thing. Cache stable target/topology lookup separately from live geometry, preserving recursive clipping and cycle detection. This is more useful than indiscriminately adding another `useMemo` around a value whose array dependency changes each frame.
- `EmbeddedDiagramAuthoring.tsx` includes the complete `parent` object in its publication memo dependencies. Root dragging replaces that object. `embeddedDiagram` actually consumes its identity, size and stacking, not its position; it clones every child node/data/style and edge/style and rebuilds IDs when called. Depend on the parent fields that matter plus numeric clip bounds so a parent translation with unchanged local clipping can reuse the child projection. Nested clipping changes still require recalculation. This is the strongest source-backed candidate for avoidable projection work.
- `SpaceCanvas` reconstructs aggregate canvas-node and canvas-edge arrays when `liveEmbeddings` changes. Retained embeddings also recreate nodes and callbacks in that memo. Narrowing publication churn above can preserve these inputs and avoid propagation into React Flow. Separately investigate read-only retained drawings, whose geometry should still reclip when necessary.
- All embedding change handlers receive every node-change batch, then filter by local ownership. An ownership dispatch index could reduce work with many embeddings, but should be justified by profiling; current code is straightforward and may be cheap relative to projection and rendering.

These candidates preserve the current one-canvas `parentId` model. Replacing it with separate nested React Flow instances would add another rendering model and should require independent evidence and a design decision.
