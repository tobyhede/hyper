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
    module: 'packages/app/src/main.tsx',
    reason: 'The browser entry point: one `createRoot` call and startup composition.',
  },
  {
    module: 'packages/react-flow-adapter/src/CardNode.tsx',
    reason:
      "A limit of the walk, not a property of the component — the one entry here that is a defect rather than a design fact, and `.scratch/architecture-review/issues/09` owns removing it. A stable story does render this: `canvas-card-hover-reveals-actions-and-handles-together` mounts the real `CardNode` in a real `ReactFlow`. The checker cannot see it because the story reaches it through `nodeTypes`, which the adapter's index declares as a local `const` rather than re-exporting, so resolving the barrel by the names taken through it finds nothing.",
  },
  {
    module: 'packages/ui/src/Command.tsx',
    reason:
      'Deliberately without a consumer, like `Select` above. It wraps cmdk, which ADR 0050 kept rather than migrating; `CardSearchCombobox` composes Base UI’s `Combobox` from `components/combobox.tsx` and does not reach this. Retiring a primitive an ADR names is a foundation decision, not a surface one.',
  },
  {
    module: 'packages/ui/src/AddCardControl.tsx',
    reason:
      "Without a consumer since ADR 0082: the Space Sidebar drew it, and the Command Dock's `CreateMenu` offers the three kinds as peers behind one trigger rather than as this split control, on grounds its own doc comment states. The two designs disagree deliberately, so this is not a component waiting to be re-mounted — but it is named by ADR 0050 and by `docs/agents/ui.md` as where the Base UI `Menu` and the `aria-keyshortcuts` convention are read from, so retiring it is a foundation decision rather than a surface one. `.scratch/command-dock/issues/08-retire-the-sidebar-era-primitives.md` owns taking it.",
  },
  {
    module: 'packages/ui/src/components/sidebar.tsx',
    reason:
      'The registry `Sidebar`, whose Space-chrome consumer ADR 0082 retired: the gutter is gone, the command surface is a `Toolbar` over the canvas, and nothing composes `SidebarProvider`, `SidebarInset` or `SidebarTrigger` any more. Same owner as `AddCardControl` above — retiring a registry primitive an ADR names is a foundation decision, not this surface promotion.',
  },
  {
    module: 'packages/ui/src/OpenSpaces.tsx',
    reason:
      'The vertical tab strip that drew the open set beside the Sidebar. ADR 0082 leaves *which* surface draws that set as treatment and the Command Dock draws it, as the tree the Opener makes — a strip as well would be a second place to switch Spaces, and it is the one that needs a permanent column to stand in. So `OpenSpacesApplication` stopped rendering it and nothing else does. It is listed here rather than deleted because the module also exports `openSpaceStatusLabel`, the words both surfaces spend, which `dock-model.ts` imports — and that import is exactly what let the module pass the ratchet unlisted, since a barrel name resolving here marks it rendered whether or not the *component* has a consumer. `.scratch/command-dock/issues/08-retire-the-sidebar-era-primitives.md` owns splitting the words out and taking the component with `tabs.tsx`, its only remaining dependency.',
  },
  {
    module: 'packages/ui/src/components/tabs.tsx',
    reason:
      'Reached only from `OpenSpaces.tsx` above, and retired with it. Nothing else in the tree composes a tab list — the Dock discloses its sets from the bar.',
  },
  {
    module: 'packages/ui/src/components/sheet.tsx',
    reason:
      "The registry `Sidebar`'s phone branch, and its only importer. The Dock has no Sheet on purpose — it never takes the canvas away, so there is nothing to dismiss before a command's result can be seen — so this stands or falls with `sidebar.tsx` above and is retired with it.",
  },
  {
    module: 'packages/ui/src/components/skeleton.tsx',
    reason:
      "The registry `Sidebar`'s loading placeholder, reached only through `SidebarMenuSkeleton`, and its only importer. Stands or falls with `sidebar.tsx` above.",
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
      "The adapter's node wrapper: card sizing from `--card-width`/`--card-height` and the Expanded Card's fill of the box the Diagram authored, per-Graph port and authoring-handle geometry, handle reveal driven by the connection state, React Flow's own `NodeResizeControl` in the Card's palette, and the one rule naming the actively presented Card. React Flow measures against this box, so it cannot move into the component it wraps.",
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
