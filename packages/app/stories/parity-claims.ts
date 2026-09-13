/**
 * `applicationEvidence` is normally undeclared: the catalogue check requires
 * exactly one `packages/app/e2e` test tagged with the claim's id, found the
 * same way the Ladle evidence is. Declaring it here instead is a documented
 * exemption from that one requirement — the reason stands in place of the
 * test the check would otherwise demand, and Ladle evidence is still
 * required regardless.
 */
export interface ParityClaim {
  readonly id: string;
  readonly storyFile: string;
  readonly storyExport: string;
  readonly claim: string;
  readonly applicationEvidence?: string;
}

export const parityClaims: readonly ParityClaim[] = [
  {
    id: 'thing-rail-reveal-distinguishes-pointer-and-keyboard',
    storyFile: 'components/thing.stories.tsx',
    storyExport: 'OpenAndClose',
    claim:
      'Pointer Open and Close allow the rail to hide on departure; keyboard activation keeps the focused command visible across both transitions.',
  },
  {
    id: 'command-dock-creates-each-kind-in-one-press',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'Default',
    claim:
      'Create offers both Thing kinds as peer controls rather than behind a disclosure, each named for the kind it makes and both withdrawn together, so one activation reaches either kind available in the Dock — and every kind available in the Dock now completes its Edit on that one activation (ADR 0089). Alias is not a Dock Create peer.',
  },
  {
    id: 'command-dock-packs-things-onto-one-row',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'DockedLeft',
    claim:
      'On a side edge the Things cluster packs onto one row at its neighbours’ height, its trigger giving up the slack track the three authored names need, with the disclosure and both Create controls on one glyph pitch.',
  },
  {
    id: 'command-dock-identity-presentation',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'Default',
    claim:
      'Space, Diagram and Graph names share typography and are each a rename control rather than a label, and a name that opens its editor takes the caret back on Escape.',
  },
  {
    id: 'things-popover-adds-existing-diagram-members',
    storyFile: 'surfaces/things-popover.stories.tsx',
    storyExport: 'AvailableThings',
    claim:
      'The Things list, anchored to its own trigger, draws each Thing absent from the Diagram as a titled row carrying its kind glyph and a drag grip, and activates an existing Thing through the application Add to Diagram path.',
  },
  {
    id: 'things-popover-opens-and-dismisses-without-locking-the-canvas',
    storyFile: 'surfaces/things-popover.stories.tsx',
    storyExport: 'AvailableThings',
    claim:
      'The Things list opens anchored to its own trigger, dismisses on Escape with focus returning to that trigger, and leaves the surface behind it both live and undismissing — which is what dropping a Thing onto the canvas is.',
  },
  {
    id: 'things-popover-keeps-the-reader-in-the-list-after-a-keyboard-add',
    storyFile: 'surfaces/things-popover.stories.tsx',
    storyExport: 'AvailableThings',
    claim:
      'A keyboard Add leaves the Things list open and puts the caret back in its filter, rather than following the placed Thing onto the canvas — so adding several Things costs one disclosure.',
  },
  {
    id: 'things-popover-offers-the-meta-spaces-beside-the-things',
    storyFile: 'surfaces/things-popover.stories.tsx',
    storyExport: 'MetaSpaces',
    claim:
      'The Things list offers the Meta Space’s Spaces interleaved with this Space’s Things, each row carrying the glyph that says which it is, and the Spaces toggle takes them away without touching the Things.',
  },
  {
    id: 'things-popover-counts-what-each-filter-contributes',
    storyFile: 'surfaces/things-popover.stories.tsx',
    storyExport: 'AvailableThings',
    claim:
      'Each filter switch draws its glyph beside the number of rows it is contributing under the current search — including zero, and including a switch the reader has turned off — and the count moves with the search rather than reporting what the Space holds.',
  },
  {
    id: 'things-popover-distinguishes-an-empty-diagram',
    storyFile: 'surfaces/things-popover.stories.tsx',
    storyExport: 'Empty',
    claim: 'A Diagram containing every Space Thing names that empty Things View explicitly.',
  },
  {
    id: 'things-popover-scrolls-a-long-list-on-a-narrow-screen',
    storyFile: 'surfaces/things-popover.stories.tsx',
    storyExport: 'LongList',
    claim:
      'A long Things list remains searchable and independently scrollable inside the viewport on a narrow screen.',
  },
  {
    id: 'things-popover-withdraws-while-authoring-is-unavailable',
    storyFile: 'surfaces/things-popover.stories.tsx',
    storyExport: 'Disabled',
    claim:
      'The Things trigger is disabled while the Diagram cannot accept membership edits — presenting, an open Thing, or Alias creation.',
  },
  {
    id: 'things-popover-keeps-an-add-refusal-on-its-surface',
    storyFile: 'surfaces/things-popover.stories.tsx',
    storyExport: 'Refused',
    claim: 'A refused Add remains visible in the open Things list that asked for it.',
    applicationEvidence:
      'No browser gesture reaches a repeated Add. Completing the first one removes the Thing from `thingsOutsideSelectedDiagram`, so the row unmounts before a second click can land on it, and only two events dispatched inside one task reach the refusal at all. The story is driven to the state instead, through the production Authoring composition, so the sentence it draws is the one `describeAuthoringRefusal` gives the application.',
  },
  {
    id: 'things-popover-coexists-with-persistence-failure',
    storyFile: 'surfaces/things-popover.stories.tsx',
    storyExport: 'PersistenceFailure',
    claim:
      'A failed membership save leaves the Things list available beside the standing retryable persistence notice.',
  },
  {
    id: 'canvas-thing-fills-authored-node-rect',
    storyFile: 'components/thing.stories.tsx',
    storyExport: 'ResizeControl',
    claim:
      'The production CanvasThing fills a React Flow node whose authored rect differs from the collapsed default.',
  },
  {
    id: 'open-thing-offers-one-resize-control',
    storyFile: 'components/thing.stories.tsx',
    storyExport: 'ResizeControl',
    claim:
      'Every Open Thing exposes one bottom-right resize control revealed by hover, selection or focus, and a Closed Thing exposes none.',
  },
  {
    id: 'resize-preview-snaps-to-closed-rect',
    storyFile: 'components/thing.stories.tsx',
    storyExport: 'ResizeControl',
    claim:
      'A resize proposal entering the complete Close range previews the exact Closed rect while the active gesture still owns an Open Thing.',
  },
  {
    id: 'active-thing-resize-tracks-pointer-without-dimension-animation',
    storyFile: 'components/thing.stories.tsx',
    storyExport: 'ResizeControl',
    claim:
      'An active Thing resize applies each proposed width and height directly, without animating either dimension behind the pointer.',
  },
  {
    id: 'markdown-thing-opens-and-closes-in-place',
    storyFile: 'components/thing.stories.tsx',
    storyExport: 'OpenAndClose',
    claim:
      'A Markdown Thing opens and closes inside its production React Flow node with authoring handles present, retaining one Thing and Title treatment; its content fades out inertly before unmounting while its Title stays bottom-anchored for the whole closing motion.',
  },
  {
    id: 'open-markdown-thing-owns-its-editing-lifecycle',
    storyFile: 'components/thing-editing.stories.tsx',
    storyExport: 'Markdown',
    claim:
      'An open Markdown Thing begins editing from its rendered body or rail without a second visible affordance, keeps blur inert, and ends through Save, Cancel, Escape or Mod-Enter while Close remains disabled.',
  },
  {
    id: 'canvas-thing-exposes-kind-and-keyboard-actions',
    storyFile: 'components/thing.stories.tsx',
    storyExport: 'Actions',
    claim: 'The production canvas Thing exposes Alias identity and keyboard-focusable actions.',
  },
  {
    id: 'canvas-thing-shows-rest-selected-and-dragging-states',
    storyFile: 'components/thing.stories.tsx',
    storyExport: 'States',
    claim:
      'Rest, selected and dragging are visually distinct states for both the Markdown and Alias front.',
    // React Flow's own selection/dragging booleans, and ThingNode's translation
    // of them into CanvasThing's four-value `state`, are unit-tested directly
    // (`ThingNode.test.tsx`, "translates React Flow selection and dragging into
    // shared visual states"). Dragging a real Thing is exercised throughout
    // `editing.spec.ts`'s drag-and-drop coverage, and selection through
    // `canvas-thing-exposes-kind-and-keyboard-actions`'s own application
    // evidence above. What this story adds beyond those is the *visual*
    // pairing of state with treatment (box-shadow ring, rotated drop shadow)
    // side by side for review — and it renders through `CanvasThingSpecimen`,
    // a thin pass-through to the shipped `CanvasThing`, so there is no
    // facsimile that could drift from what the translated state actually
    // draws.
    applicationEvidence:
      'React Flow selection/dragging and their translation into state are covered by ThingNode.test.tsx and by editing.spec.ts drag coverage; selection is also exercised by canvas-thing-exposes-kind-and-keyboard-actions. This story renders the shipped CanvasThing through CanvasThingSpecimen (no facsimile) to pin the visual treatment per state for review, which is not itself a distinct browser-observable product behaviour beyond those.',
  },
  {
    id: 'canvas-thing-front-draws-only-its-title-lines',
    storyFile: 'components/thing.stories.tsx',
    storyExport: 'Front',
    claim:
      'Every Thing front draws its kind glyph, its border treatment and one element per Title Line at the role the domain gave it — and draws nothing beneath the Title but the Title Lines the author typed.',
  },
  {
    id: 'canvas-thing-shows-kind-treatment',
    storyFile: 'components/thing.stories.tsx',
    storyExport: 'Kinds',
    claim:
      "An Alias front's dotted border and redraw glyph, and a long Markdown title's three-line clamp, are the kind's own presentation.",
  },
  {
    // **The former coloured-rail claim, changed rather than dropped.**
    // It read "a selected Thing's rail carries the Active Graph's own colour",
    // which was true and is now deliberately false: the rail is neutral and the
    // commands on it are the Command Dock's own surface
    // (`.scratch/command-dock/issues/12`). The claim keeps the palette sweep,
    // because what has to hold at every colour is the *opposite* of what it used
    // to be — and adds the half that says where the colour went.
    id: 'canvas-thing-toolbar-is-neutral-and-graph-colour-stays-on-connections',
    storyFile: 'components/thing.stories.tsx',
    storyExport: 'Colours',
    claim:
      "A Thing's revealed commands are drawn on the same neutral command surface as the Command Dock at every Active Graph colour, while the Thing's authoring handles and its Edges keep that colour.",
  },
  {
    id: 'canvas-thing-hover-reveals-actions-and-handles-together',
    storyFile: 'components/thing.stories.tsx',
    storyExport: 'Hover',
    claim:
      "Hovering the real React Flow node reveals CanvasThing's own rail actions and the adapter's Edge handles together.",
    // The two halves of this claim already have real application evidence
    // separately: hover revealing CanvasThing's rail actions is asserted in
    // `editing.spec.ts` ("inline title editing persists without moving or
    // opening the Thing", `await thing.hover(); ... toHaveCSS('opacity', '1')`
    // on the Edit control), and hover/selection revealing the adapter's
    // authoring handles is asserted in `overview.spec.ts` ("handles stay
    // measurable...") and unit-tested in ThingNode.test.tsx. What this story
    // adds is mounting both through the same real `ThingNode` in a real
    // `ReactFlow` instance side by side, which is exactly what
    // `CanvasThingNodeSpecimen` does — not a facsimile of
    // either half.
    applicationEvidence:
      "Hover revealing CanvasThing's rail actions is covered by editing.spec.ts (asserted on the `canvas-thing-actions` container, which is where the reveal's opacity lives — `opacity` does not inherit, so the same assertion on a button could not fail); hover/selection revealing the adapter's authoring handles is covered by overview.spec.ts and ThingNode.test.tsx. This story mounts the real ThingNode in a real ReactFlow instance (CanvasThingNodeSpecimen, no facsimile) to show both together, which is not a distinct browser-observable behaviour beyond those two.",
  },
  {
    id: 'canvas-thing-owns-title-editing-and-refusal',
    storyFile: 'components/thing-editing.stories.tsx',
    storyExport: 'Title',
    claim:
      "The canvas Thing's displayed Title is a named pointer and keyboard control that opens its field with the value selected, keeps a refused draft field-local, completes on Enter and cancels on Escape.",
  },
  {
    id: 'two-space-things-draw-one-target-at-their-own-selections',
    storyFile: 'surfaces/space-thing-embedded-diagram.stories.tsx',
    storyExport: 'TwoSelectionsOfOneTarget',
    claim:
      'Two Space Things referencing one Space each draw the Diagram they store rather than the target\u2019s own opening Diagram, so their embeddings differ in membership while converging on one Space.',
    // Both Space Things can be authored in a browser, but only against a target
    // that owns two Diagrams \u2014 and a second Diagram is Add Diagram, which acts
    // on the Space the author is *in*. Entering that Space is the rail command
    // `space-cards/11` owns. The remaining gap is a target that already owns
    // two Diagrams, not the absence of Enter \u2014 the e2e fixture does not author
    // that second Diagram through the browser \u2014 so the claim takes the
    // documented exemption meanwhile.
    applicationEvidence:
      'A second Diagram in the target is Add Diagram from inside that Space. Entering a Space Thing is now the rail command `space-cards/11` owns, but this claim still needs a target that already owns two Diagrams — the e2e fixture does not author that second Diagram through the browser. `packages/app/test/space-thing-authoring.test.tsx` proves two Space Things keeping their own selections through the application path meanwhile, and `test/support/repository-contract.ts` proves the pair survives the aggregate round trip.',
  },
  {
    id: 'space-thing-offers-enter',
    storyFile: 'components/thing.stories.tsx',
    storyExport: 'EnterSpace',
    claim:
      'A Space Thing offers Enter on its rail as a kind command; activating it is the crossing that adds the target to Open Spaces and shows that Space.',
  },
  {
    id: 'open-alias-shows-target-markdown-read-only',
    storyFile: 'components/thing.stories.tsx',
    storyExport: 'OpenAlias',
    claim:
      'An Open Alias keeps its own Title, renders its Target Markdown read-only, and offers Close without Target or source-edit controls.',
  },
  /*
   * **`persistence-indicator-shows-save-lifecycle` is retired with its story,
   * for the reason the Dock's own claims are the shape they are.** It said
   * persistence reports saving, briefly acknowledges success and returns to
   * rest, and `components/persistence-indicator.stories.tsx` drove exactly that
   * through a real `SpaceSession`. The Command Dock mounts `PersistenceControl`
   * only for a conflict and a rejection — ticket `01` settled that there is no
   * resting cue, because a commit settles faster than a dot can be read — so
   * the saving half of that lifecycle is unreachable in the application, and a
   * stable story for a state production cannot reach is not parity evidence
   * (ADR 0052).
   *
   * `PersistenceIndicator` itself keeps a production path and needs no
   * inventory entry: an acknowledged rejection draws it, which is the Dock's
   * `SaveRejected` story, and the coverage walk reaches the module through
   * `PersistenceControl`.
   */
  /*
   * The Command Dock (ADR 0082).
   *
   * **Thirteen claims stood here and none of them was carried across.** They
   * named `space/space.stories.tsx` and `space/messaging.stories.tsx`, both of
   * which are gone with `SpaceSidebar`, and four of them named the Sidebar in
   * the claim sentence itself. Carrying one would have asserted that the
   * behaviour did not change; the audit in
   * `.scratch/command-dock/issues/07-promote-the-dock-and-retire-the-space-sidebar.md`
   * is what found that five of the thirteen were false about the Dock. Each
   * claim below states one obligation in the Dock's own words, so a reader
   * comparing them to the old set reads two surfaces rather than one renamed.
   *
   * **Two obligations left rather than moved.** A Thing's Copy link, Copy
   * permanent link and Delete belong to the Thing rail (ADR 0073) and not to
   * this surface — the Dock's organising rule is that a Thing's own commands are
   * absent — so `space-sidebar-copies-thing-destinations` and
   * `space-sidebar-entity-actions-menu` have no successor here. They keep their
   * browser evidence in `space-routing.spec.ts` and `link-actions.spec.ts`
   * untagged, and they gain a claim of their own when the rail's story sheet
   * leaves `stories/review`.
   *
   * **And one was retired rather than restated.** `space-sidebar-shows-pending-
   * persistence` claimed a pending commit is exposed as saving. Ticket `01`
   * settled that the Dock carries no resting cue at all — a commit settles
   * faster than a dot can be read — so `PersistenceIndicator` is never called
   * from here and there is nothing left to claim.
   */
  {
    id: 'command-dock-marks-one-current-diagram',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'Default',
    claim:
      "Exactly one authored Diagram is the one drawing the canvas, chosen from the Diagram cluster's single exclusive list, which names the chosen one on the cluster itself.",
  },
  {
    id: 'command-dock-adds-an-empty-diagram',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'Default',
    claim:
      'New Diagram sits in the Diagram menu beside the list it adds to, and creates and selects an empty Diagram without implicitly placing Things.',
  },
  {
    id: 'command-dock-copies-graph-destinations',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'Default',
    claim:
      "The Graph menu offers Copy link and Copy permanent link, building the current-Diagram address and the Graph's own address respectively.",
  },
  {
    id: 'command-dock-edits-identity-names',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'Default',
    claim:
      'The Space, Diagram and Graph names are each their own rename control, editing in place as one refusable draft that keeps a refusal on the field, completes on Enter and cancels on Escape.',
  },
  {
    id: 'command-dock-marks-the-space-one-crossing-up',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'Default',
    claim:
      'A Space entered from another names that one Space as a step back, marked with the parent glyph, and holds every other open Space behind the Open Spaces disclosure beside it.',
  },
  {
    id: 'command-dock-keeps-its-names-on-a-side-edge',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'DockedLeft',
    claim:
      'Docked to a side edge the surface is a column of named rows rather than a rail of glyphs, and its disclosures open away from that edge into the canvas.',
  },
  {
    id: 'command-dock-names-a-new-spaces-initial-diagram-and-graph',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'NewSpace',
    claim:
      'A new Space names its initial Diagram and its empty Active Graph rather than leaving either cluster blank, and cannot present.',
  },
  {
    id: 'command-dock-withdraws-entirely-while-presenting',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'Presenting',
    claim:
      'Presenting hides the command toolbar and leaves the presenting chrome; a failed save remains reported with Retry reachable.',
  },
  {
    id: 'command-dock-fits-a-narrow-container',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'Narrow',
    claim:
      'At phone width every cluster keeps its name, its disclosure and its place in the roving order, reached by scrolling the surface along its own axis with nothing to dismiss first.',
  },
  {
    id: 'command-dock-recovers-retryable-failure',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'SaveFailed',
    claim:
      'A retryable persistence failure keeps local work visible and offers Retry beside the toolbar rather than inside it.',
  },
  {
    id: 'command-dock-reports-permanent-rejection',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'SaveRejected',
    claim: 'Permanent persistence rejection explains the reason and can be acknowledged.',
  },
  {
    id: 'command-dock-resolves-conflict',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'SaveConflict',
    claim: 'A revision conflict blocks dismissal until local or stored work is chosen.',
  },
  {
    id: 'command-dock-names-an-unwell-open-space',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'SaveFailedElsewhere',
    claim:
      'The bar marks that another open Space is unwell before anything is disclosed, and the Open Spaces menu names which one, in words rather than colour alone, offering no recovery there.',
  },
  {
    id: 'presenting-line-offers-one-move',
    storyFile: 'components/presenting-chrome.stories.tsx',
    storyExport: 'Line',
    claim: 'A line offers one move, named as the destination it goes to.',
  },
  {
    id: 'presenting-space-activates-one-control-once',
    storyFile: 'components/presenting-chrome.stories.tsx',
    storyExport: 'Line',
    claim:
      'Space on a focused move activates that control once instead of also advancing globally.',
  },
  {
    id: 'presenting-fork-selects-then-commits',
    storyFile: 'components/presenting-chrome.stories.tsx',
    storyExport: 'Fork',
    claim: 'Choosing a fork branch selects it, and going commits down the branch chosen.',
  },
  {
    id: 'presenting-sink-ends-the-graph-and-can-retreat',
    storyFile: 'components/presenting-chrome.stories.tsx',
    storyExport: 'Sink',
    claim: 'A sink announces the end of the Graph and Back recovers the Thing before it.',
  },
  {
    id: 'presenting-narrow-keeps-choices-and-controls',
    storyFile: 'components/presenting-chrome.stories.tsx',
    storyExport: 'Narrow',
    claim: 'A narrow chrome keeps the choices in their own row above Back, guidance and Overview.',
  },
  {
    id: 'operational-feedback-startup-failure',
    storyFile: 'components/operational-feedback.stories.tsx',
    storyExport: 'Startup',
    claim: 'A Space the backend cannot open fails startup with the real diagnostic detail.',
  },
  {
    id: 'operational-feedback-space-app-failure',
    storyFile: 'components/operational-feedback.stories.tsx',
    storyExport: 'SpaceApp',
    claim:
      "The Space app's error boundary reports a mounted app's render throw instead of leaving a blank page.",
    // Every production write path that could hand `App` a bad working
    // snapshot validates first and refuses inline rather than installing it:
    // Open Spaces (initial load), Space Authoring's edit completion,
    // and the conflict accept/reload flow (`acceptStoredSpace` in
    // space-authoring.ts, guarding exactly this). Reaching this boundary means
    // an invariant already broke — see `SpaceApp.tsx`'s own doc comment — and
    // the only place that is exercised is `packages/app/test/SpaceApp.test.tsx`,
    // which opens a session directly with a pre-corrupted snapshot: an
    // internal API no browser-driven `packages/app/e2e` test can reach. There
    // is no legitimate user- or network-observable flow left to drive it
    // through the real app, so this claim is Ladle-only.
    applicationEvidence:
      'Unreachable through any current legitimate browser-driven flow — every production path that could install a bad working snapshot validates first (Open Spaces, Space Authoring edit completion, conflict accept/reload). Covered instead by packages/app/test/SpaceApp.test.tsx, which reaches the boundary only via the internal openSpaceSession API.',
  },
  {
    id: 'operational-feedback-placement-failure',
    storyFile: 'components/operational-feedback.stories.tsx',
    storyExport: 'Placement',
    claim: 'A strategy that cannot produce positions fails placement with its own diagnostic.',
    applicationEvidence:
      'Selectable V1 Diagrams use the in-process positioned strategy, so a browser cannot deterministically block it. Covered by packages/app/test/placement-rendering.test.tsx.',
  },
  {
    id: 'operational-feedback-placement-pending',
    storyFile: 'components/operational-feedback.stories.tsx',
    storyExport: 'Arranging',
    claim: 'The canvas shows a busy state while a strategy is still arranging Things.',
    applicationEvidence:
      'The positioned strategy settles before Playwright can deterministically observe the pending frame. Covered by packages/app/test/placement-rendering.test.tsx.',
  },
  {
    id: 'selected-edge-controls-offer-edit-and-delete',
    storyFile: 'components/selected-edge-controls.stories.tsx',
    storyExport: 'Closed',
    claim: 'A selected Edge offers Edit and Delete, and only Edit opens the endpoint editor.',
  },
  {
    id: 'selected-edge-edit-trigger-reads-as-open',
    storyFile: 'components/selected-edge-controls.stories.tsx',
    storyExport: 'EndpointEditor',
    claim:
      "A selected Edge's Edit trigger reads as open — the quiet secondary fill — while its editor is open.",
  },
  {
    id: 'selected-edge-editor-shows-both-endpoints',
    storyFile: 'components/selected-edge-controls.stories.tsx',
    storyExport: 'EndpointEditor',
    claim:
      'The endpoint editor names both endpoints, completes on the Thing chosen, and dismisses its list then itself on Escape.',
  },
  {
    id: 'selected-edge-endpoint-refusal-disables-its-choice',
    storyFile: 'components/selected-edge-controls.stories.tsx',
    storyExport: 'DisabledChoice',
    claim: 'An endpoint the Edit would refuse stays listed, disabled, with its reason.',
    applicationEvidence:
      'The fixture Graphs are lines, so no endpoint choice reachable in E2E is refused. Covered instead by packages/app/test/SelectedEdgeControls.test.tsx.',
  },
  {
    id: 'selected-edge-from-refusal-is-field-local',
    storyFile: 'components/selected-edge-controls.stories.tsx',
    storyExport: 'FromRefusal',
    claim: 'A refused From endpoint marks only that Field and carries its own description.',
    // A reconnection refusal is only reachable once the Space has moved under an
    // *open* editor: eligibility disables every ineligible row when the editor
    // opens, and Base UI will not let a disabled row be chosen, so no browser
    // gesture can propose one. Producing the race through the app would mean
    // driving a second writer against the same session mid-interaction, which
    // no `packages/app/e2e` fixture exposes and which would prove the harness
    // rather than the surface. The *mapping* it exercises is covered in the node
    // environment by `packages/app/test/authoring-refusal.test.ts`, exhaustively
    // over all eighteen codes, and the surface's own placement by
    // `packages/app/test/SelectedEdgeControls.test.tsx`.
    applicationEvidence:
      'Unreachable through any browser gesture — the editor snapshots eligibility on opening and disables every refusable row, so a refused reconnection needs the Space to change under an open editor. Covered instead by packages/app/test/authoring-refusal.test.ts (the exhaustive placement) and packages/app/test/SelectedEdgeControls.test.tsx (the Field it lands on).',
  },
  {
    id: 'selected-edge-to-refusal-is-field-local',
    storyFile: 'components/selected-edge-controls.stories.tsx',
    storyExport: 'ToRefusal',
    claim: 'A refused To endpoint marks only that Field, leaving From valid.',
    applicationEvidence:
      'Unreachable for the same reason as the From refusal above — a refused reconnection needs the Space to change under an open editor, which no browser gesture produces. Covered instead by packages/app/test/authoring-refusal.test.ts and packages/app/test/SelectedEdgeControls.test.tsx.',
  },
  {
    id: 'selected-edge-stale-reconnection-uses-the-form-channel',
    storyFile: 'components/selected-edge-controls.stories.tsx',
    storyExport: 'ReconnectionRefusal',
    claim: 'A stale Diagram, Graph or Edge reports on the form channel and marks neither Field.',
    applicationEvidence:
      'The remaining stale conditions need the Space to change under an open editor. Covered instead by packages/app/test/authoring-refusal.test.ts and packages/app/test/SelectedEdgeControls.test.tsx.',
  },
  {
    id: 'selected-edge-deletion-refusal-stays-on-its-controls',
    storyFile: 'components/selected-edge-controls.stories.tsx',
    storyExport: 'DeletionRefusal',
    claim: 'A refused Delete stays on the surviving selected-Edge controls.',
    applicationEvidence:
      'The stale deletion refusal requires the Space to change under an open control. Covered instead by packages/app/test/SelectedEdgeControls.test.tsx.',
  },
  {
    id: 'canvas-zoom-control-operates-the-real-viewport',
    storyFile: 'components/zoom-control.stories.tsx',
    storyExport: 'Canvas',
    claim:
      'The themed canvas control continuously zooms with its slider, zooms with its buttons and fits the real React Flow viewport.',
  },
  {
    id: 'open-space-thing-draws-its-selected-diagram',
    storyFile: 'surfaces/space-thing-embedded-diagram.stories.tsx',
    storyExport: 'SelectedDiagram',
    claim:
      "An Open Space Thing draws the Diagram it selects — the target Space's own Things and the one Graph across them — as sub-flow children of the containing canvas, whose measured boxes stay inside the Space Thing's own rect.",
  },
  {
    id: 'open-space-thing-chooses-its-context-on-the-shared-controls',
    storyFile: 'surfaces/space-thing-embedded-diagram.stories.tsx',
    storyExport: 'SelectedDiagram',
    claim:
      "An Open Space Thing's Diagram and Graph choices are drawn on the Command Dock's own command surface and through the same shared control and list, and choosing one writes the Thing's stored context without moving the containing Space.",
  },
  {
    id: 'embedded-diagram-things-author-target',
    storyFile: 'surfaces/space-thing-embedded-diagram.stories.tsx',
    storyExport: 'SelectedDiagram',
    claim:
      'Editing a Thing inside an Open Space Thing authors its target Space and updates both canvases; cross-Space connection handles remain unavailable.',
  },
  {
    id: 'graph-hud-and-dock-agree-on-the-active-graph',
    storyFile: 'surfaces/graph-hud.stories.tsx',
    storyExport: 'Retained',
    claim: 'The canvas HUD keys every Graph and emphasises the active one, beside a real MiniMap.',
  },
] as const;
