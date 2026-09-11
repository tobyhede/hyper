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
 * currently breaks that rule and says so — `ThingNode.tsx` is rendered by a stable
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
    module: 'packages/app/src/SpaceApp.tsx',
    reason:
      'Isolated single-Space mounting adapter, reached only by `packages/app/test/space-mounting.ts`. Startup mounts `OpenSpacesApplication` for every host, so no story renders this and an import edge would be the only thing catalogue coverage could rest on.',
  },
  {
    module: 'packages/app/src/main.tsx',
    reason: 'The browser entry point: one `createRoot` call and startup composition.',
  },
  {
    module: 'packages/react-flow-adapter/src/ThingNode.tsx',
    reason:
      "A limit of the walk, not a property of the component — the one entry here that is a defect rather than a design fact, and `.scratch/architecture-review/issues/09` owns removing it. A stable story does render this: `canvas-thing-hover-reveals-actions-and-handles-together` mounts the real `ThingNode` in a real `ReactFlow`. The checker cannot see it because the story reaches it through `nodeTypes`, which the adapter's index declares as a local `const` rather than re-exporting, so resolving the barrel by the names taken through it finds nothing.",
  },
  {
    module: 'packages/ui/src/Command.tsx',
    reason:
      'Deliberately without a consumer. It wraps cmdk, which ADR 0050 kept rather than migrating; `ThingSearchCombobox` composes Base UI’s `Combobox` from `components/combobox.tsx` and does not reach this. Retiring a primitive an ADR names is a foundation decision, not a surface one.',
  },
  {
    module: 'packages/ui/src/components/drawer.tsx',
    reason:
      'Without a consumer since `.scratch/command-dock/issues/10-decide-the-cards-surface.md` restored the Things surface decision: `ThingsDrawer` was its only one, and the Things list is a `Popover` anchored to the Dock’s own trigger — which is what the prototype’s three-surface comparison chose, on the ground that a screen-edge drawer occludes the canvas edge you are dropping onto. The registry `Drawer` and `DRAWER_WIDTH` are what is left, and `AppShell`’s `insetEnd` is left standing with them. `08-retire-the-sidebar-era-primitives.md` took the Sidebar-era primitives while this one still had a consumer, so it did not take this; retiring a registry primitive is a foundation decision rather than a surface one, and `16-retire-the-registry-drawer-and-the-yielded-strip.md` is the decision of its own that owns taking the three.',
  },
  {
    module: 'packages/ui/src/components/empty.tsx',
    reason:
      'Deliberately without a consumer, for the same reason as `Command.tsx` above. A shadcn registry primitive for an empty result set — the combobox empty message comes from Base UI’s own `ComboboxEmpty`, not from here.',
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
 * hand-rolled the way `canvas-thing.css` sits beside `CanvasThing`.
 *
 * A rule naming no class at all — `#root`, the `*` and `body` resets — is keyed by
 * its leading attribute or id, or failing both by its leading element name, so those
 * cannot slip past by having no class to record.
 *
 * The Thing-choice popup's theme lives in
 * `packages/ui/src/thing-search-combobox.css` beside `ThingSearchCombobox`, the
 * component it actually styles.
 */
export const handRolledStyles = [
  {
    block: 'react-flow',
    reason:
      "React Flow's own classes, restyled where the library's defaults do not suit the canvas. Integration styling by definition — no module here emits these names.",
  },
  {
    block: 'rf-thing-node',
    reason:
      "The adapter's node wrapper: thing sizing from `--thing-width`/`--thing-height` and the Expanded Thing's fill of the box the Diagram authored, per-Graph port and authoring-handle geometry, handle reveal driven by the connection state, React Flow's own `NodeResizeControl` in the Thing's palette, and the one rule naming the actively presented Thing. React Flow measures against this box, so it cannot move into the component it wraps.",
  },
  {
    block: 'thing',
    reason:
      "`ThingContent`'s base appearance plus the container-query typography that scales a presented Thing with its 16:9 frame (ADR 0027). The scaling half is React Flow's, and the base half sits here with it because the two are separated only by source order.",
  },
  {
    block: 'canvas-thing',
    reason:
      'One rule only: React Flow\'s "this is the actively presented Thing" fact, which is adapter and application state. `CanvasThing`\'s own appearance is in `packages/ui/src/canvas-thing.css`, beside the component.',
  },
  {
    block: 'graph-area',
    reason:
      'The flex item the `ReactFlow` instance fills; it owns React Flow integration geometry rather than product appearance.',
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
    block: 'new-thing-preview',
    reason:
      'Placement and opacity for the ghost Thing drawn over the canvas mid-drag. What it draws is a real `CanvasThing`; this is only where it sits.',
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
    block: 'thing-pane',
    reason:
      "The modal frame a Thing is authored on: the 16:9 silhouette that matches `thing.ts`, and the scroll boundary that keeps Cancel and Done reachable. Base UI's Dialog owns modality, focus and dismissal; this owns the frame's geometry against the canvas behind it.",
  },
] as const;
