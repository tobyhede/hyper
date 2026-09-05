/**
 * What the stable catalogue does not cover, and what the application still
 * styles by hand — the two gaps in the design system, written down.
 *
 * `pnpm ui:catalog:check` reads both literal lists and holds them to the tree:
 * an entry whose subject has since gained a story, lost its rule or stopped
 * existing fails, and a new production component or a new class block fails
 * until it is either built from `@project/ui` or recorded here with a reason.
 * That is the whole point — a gap costs a written justification, and a
 * justification that stops being true costs a red check.
 *
 * Neither list is a backlog. Some entries here are permanent and correct (a
 * composition root has no meaningful state to catalogue; React Flow's geometry
 * is not a design-system concern), and some name a real debt with a named
 * ticket. Both kinds say which they are, and an entry with neither a permanent
 * reason nor an owner is the one to be suspicious of.
 *
 * **A reason must be a property of its subject, never of this check.** One entry
 * currently breaks that rule and says so — `CardNode.tsx` is rendered by a stable
 * story the walk cannot follow — and it is a defect with a ticket rather than an
 * entry to keep.
 *
 * What this cannot decide: it proves a component is *rendered* by a stable
 * story, never that the story shows its meaningful states. That judgement stays
 * with human review, as the parity claim set's own semantic completeness does.
 */

/**
 * A production `.tsx` module no stable story renders.
 *
 * "Renders" is resolved through the import graph from every story under
 * `stories/components` and `stories/surfaces` — `stories/review` is excluded,
 * because a proposal is not production evidence (ADR 0052). A package barrel is
 * followed by the names taken through it rather than whole, so importing one
 * component from `@project/ui` does not silently catalogue the package.
 */
export const uncataloguedComponents = [
  {
    module: 'packages/app/src/App.tsx',
    reason:
      'Composition root. It wires Navigation, Space Authoring, the render adapter and every surface below into one tree; it has no visual state of its own, and a story of it would be the application rather than a catalogue entry.',
  },
  {
    module: 'packages/app/src/SpaceApp.tsx',
    reason:
      "Composition root, and an error boundary. What it draws when it catches is catalogued — `operational-feedback-space-app-failure` renders the boundary's own failure panel — and the rest of it is the session wiring around App.",
  },
  {
    module: 'packages/app/src/main.tsx',
    reason: 'The browser entry point: one `createRoot` call and startup composition.',
  },
  {
    module: 'packages/app/src/startup.tsx',
    reason:
      'Startup composition. It renders one opened outcome by mounting the application, while `operational-feedback-startup-failure` catalogues its failure panel.',
  },
  {
    module: 'packages/app/src/edge-authoring-react.tsx',
    reason:
      'The canvas-wide Edge gesture layer: React Flow connection callbacks and the pointer-refusal announcement, bound to a live `ReactFlow` instance. Its rendered surfaces are catalogued through `Components/Selected Edge Controls` and reviewed on a real canvas in `Review/Selected Edge On Canvas`; the gesture layer itself has no state a story can hold still.',
  },
  {
    module: 'packages/app/src/components/SpaceCanvas.tsx',
    reason:
      'The `ReactFlow` instance itself — nodes, edges, viewport, gestures. Stories that need a real canvas build their own instance from the same production projection (`GraphHudFixture`, `SelectedEdgeCanvasFixture`, `ReactFlowCanvas`) rather than mounting the application-wired one, which would carry the session with it.',
  },
  {
    module: 'packages/app/src/components/OpenSpaceSidebars.tsx',
    reason:
      'Production composition staged by `space-cards/09` under `stories/review`: issue 11 supplies the application path and promotes it with parity evidence. Until then a stable story would claim production reachability the application does not have.',
  },
  {
    module: 'packages/app/src/components/AuthorableEdge.tsx',
    reason:
      'Debt with an owner. It is rendered on a real canvas by `Review/Selected Edge On Canvas`, which carries no parity claim on purpose — the Edge line, its colour and its reconnection affordance have no stable story yet. Promoting that review story is the remaining Edge work, and it is blocked on the reconnected-Edge selection defect recorded in `findings/reconnected-edge-loses-its-selection.md`.',
  },
  {
    module: 'packages/app/src/components/NewCardPreview.tsx',
    reason:
      'Reachable only mid-gesture: the ghost Card drawn while an Edge drag is held over empty canvas. There is no coherent production boundary that holds it still — the preview exists only for the duration of a pointer gesture the harness would have to fake — so ADR 0052 keeps it out of the stable catalogue rather than admitting a facsimile.',
  },
  {
    module: 'packages/app/src/components/CanvasCentre.tsx',
    reason:
      'Camera behaviour, not appearance: it centres the viewport and renders nothing. Covered by `packages/app/test/CanvasCentre.test.tsx`.',
  },
  {
    module: 'packages/app/src/components/CanvasContinuation.tsx',
    reason:
      'Where a completed Edit leaves the author, on the canvas: it resolves a continuation against the projection React Flow is drawing, moves the camera for a Card arrived at by URL, and renders nothing. Covered by `packages/app/test/continuation.test.ts` for the rules and by the canvas assertions in `edge-authoring-react.test.tsx` and `card-creation.test.tsx` for the spend. It replaced `CardDestinationFocus.tsx`, which was here for the same reason.',
  },
  {
    module: 'packages/app/src/components/cameras.tsx',
    reason:
      'Camera behaviour, not appearance: `fitView` calls for presenting and overview, rendering nothing. Covered by `packages/app/test/cameras.test.tsx` and by the camera assertions in `presenting.spec.ts`.',
  },
  {
    module: 'packages/react-flow-adapter/src/CardNode.tsx',
    reason:
      "A limit of the walk, not a property of the component — the one entry here that is a defect rather than a design fact, and `.scratch/architecture-review/issues/09` owns removing it. A stable story does render this: `canvas-card-hover-reveals-actions-and-handles-together` mounts the real `CardNode` in a real `ReactFlow`. The checker cannot see it because the story reaches it through `nodeTypes`, which the adapter's index declares as a local `const` rather than re-exporting, so resolving the barrel by the names taken through it finds nothing.",
  },
  {
    module: 'packages/react-flow-adapter/src/RoutedEdge.tsx',
    reason:
      "The Edge line itself — ELK's routed polyline, with a bezier fallback where a strategy places no routing. It reaches the screen only through `AuthorableEdge`, so it is uncatalogued for exactly that reason and lands with it.",
  },
  {
    module: 'packages/react-flow-adapter/src/GraphConnectionLine.tsx',
    reason:
      'The line React Flow draws between the pointer and its origin during a connection drag. Like the new-Card preview above, it exists only for the duration of a gesture and has no still state to render.',
  },
  {
    module: 'packages/ui/src/OpenSpaces.tsx',
    reason:
      'Production presentation staged by `space-cards/09` under `stories/review`: issue 11 supplies the application path and promotes it with parity evidence. Its own tabs interaction and mounted-panel behavior are covered by `packages/ui/test/OpenSpaces.test.tsx` meanwhile.',
  },
  {
    module: 'packages/ui/src/Command.tsx',
    reason:
      'Deliberately without a consumer, like `Select` above. It wraps cmdk, which ADR 0050 kept rather than migrating; `CardSearchCombobox` composes Base UI’s `Combobox` from `components/combobox.tsx` and does not reach this. Retiring a primitive an ADR names is a foundation decision, not a surface one.',
  },
  {
    module: 'packages/ui/src/components/tabs.tsx',
    reason:
      "Consumed by `OpenSpaces`, which `space-cards/09` stages under `stories/review` until issue 11 supplies an application path and stable parity evidence. Its direct tests still hold the Base UI wrapper's vertical roving tabindex and `keepMounted` behavior independently of that composition.",
  },
  {
    module: 'packages/ui/src/components/empty.tsx',
    reason:
      'Deliberately without a consumer, for the same reason. A shadcn registry primitive for an empty result set — the combobox empty message comes from Base UI’s own `ComboboxEmpty`, not from here.',
  },
] as const;

/**
 * A class block `packages/app/src/styles.css` still declares.
 *
 * The block is the BEM root, so one entry covers its elements and modifiers.
 *
 * A block earns its place by being React Flow's geometry, React Flow's
 * integration, or a placement the framework forces into the application layer.
 * Product appearance does not: it belongs beside the component that draws it,
 * hand-rolled the way `canvas-card.css` sits beside `CanvasCard`.
 *
 * A rule naming no class at all — `#root`, the `*` and `body` resets — is keyed by
 * its leading attribute or id, or failing both by its leading element name, so those
 * cannot slip past by having no class to record.
 *
 * The Card-choice popup's theme lives in
 * `packages/ui/src/card-search-combobox.css` beside `CardSearchCombobox`, the
 * component it actually styles.
 */
export const handRolledStyles = [
  {
    block: 'react-flow',
    reason:
      "React Flow's own classes, restyled where the library's defaults do not suit the canvas. Integration styling by definition — no module here emits these names.",
  },
  {
    block: 'rf-card-node',
    reason:
      "The adapter's node wrapper: card sizing from `--card-width`/`--card-height` and the Expanded Card's fill of the box the Layout authored, per-Graph port and authoring-handle geometry, handle reveal driven by the connection state, React Flow's own `NodeResizeControl` in the Card's palette, and the one rule naming the actively presented Card. React Flow measures against this box, so it cannot move into the component it wraps.",
  },
  {
    block: 'card',
    reason:
      "`CardContent`'s base appearance plus the container-query typography that scales a presented Card with its 16:9 frame (ADR 0027). The scaling half is React Flow's, and the base half sits here with it because the two are separated only by source order.",
  },
  {
    block: 'canvas-card',
    reason:
      'One rule only: React Flow\'s "this is the actively presented Card" fact, which is adapter and application state. `CanvasCard`\'s own appearance is in `packages/ui/src/canvas-card.css`, beside the component.',
  },
  {
    block: 'graph-area',
    reason:
      'The flex item the `ReactFlow` instance fills beside the optional Cards drawer; it owns React Flow integration geometry rather than product appearance.',
  },
  {
    block: 'root',
    reason:
      'The React mount point, sized with `html` and `body` so the app owns exactly one viewport and the page never scrolls. Not a component and not stylable from one.',
  },
  {
    block: '*',
    reason:
      'The `box-sizing: border-box` reset. A document-wide default no component can own, and every rule in this file and in `@project/ui` is written against it.',
  },
  {
    block: 'body',
    reason:
      'The base font stack and the page background and foreground colours, set once on the document. Not a component and not stylable from one — the `html, body, #root` sizing that gives the app its one viewport is recorded as `root` above.',
  },
  {
    block: 'new-card-preview',
    reason:
      'Placement and opacity for the ghost Card drawn over the canvas mid-drag. What it draws is a real `CanvasCard`; this is only where it sits.',
  },
  {
    block: 'edge-control-layer',
    reason:
      "Placement and pointer-events for React Flow's `EdgeLabelRenderer` portal, whose layer disables pointer events by default. `SelectedEdgeControls` owns how those controls look.",
  },
  {
    block: 'canvas-refusal',
    reason:
      'Screen-fixed placement for the sentence a finished canvas command leaves behind — a completed pointer gesture, or a refused Backspace. The interaction is over, so there is no surface left on the canvas to attach it to.',
  },
  {
    block: 'shell',
    reason:
      'Viewport ownership: the app owns exactly one viewport and never scrolls the page, and the canvas notice is placed over the canvas without covering its controls. `AppShell` owns the chrome; this owns where it sits against a full-bleed canvas.',
  },
  {
    block: 'card-pane',
    reason:
      "The modal frame a Card is authored on: the 16:9 silhouette that matches `card.ts`, and the scroll boundary that keeps Cancel and Done reachable. Base UI's Dialog owns modality, focus and dismissal; this owns the frame's geometry against the canvas behind it.",
  },
] as const;
