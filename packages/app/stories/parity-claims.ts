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
    id: 'resource-toolbar-survives-open-and-close',
    storyFile: 'components/resource.stories.tsx',
    storyExport: 'OpenAndClose',
    claim:
      'Open and Close keep the Resource selected and its toolbar drawn, by pointer or keyboard, and keyboard activation keeps focus on the command across both transitions.',
  },
  {
    id: 'resource-toolbar-draws-on-selection-with-open-last',
    storyFile: 'components/resource.stories.tsx',
    storyExport: 'OpenAndClose',
    claim:
      'A Resource at rest draws no toolbar; selected, its commands are drawn with Open last, while its kind glyph stays on the Resource at its top-right corner.',
  },
  {
    id: 'canvas-resource-actions-menu',
    storyFile: 'components/resource.stories.tsx',
    storyExport: 'RailActions',
    claim:
      "A Resource's actions menu opens from its rail control and from a right click on the Resource itself, offering the same commands both ways.",
  },
  {
    id: 'command-dock-creates-each-kind-in-one-press',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'Default',
    claim:
      'Create offers both Resource kinds as peer controls rather than behind a disclosure, each named for the kind it makes and both withdrawn together, so one activation reaches either kind available in the Dock — and every kind available in the Dock now completes its Edit on that one activation (ADR 0089). Reference Resource is not a Dock Create peer.',
  },
  {
    id: 'command-dock-packs-resources-onto-one-row',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'DockedLeft',
    claim:
      'On a side edge the Resources cluster packs onto one row at its neighbours’ height, its trigger giving up the slack track the three authored names need, with the disclosure and both Create controls on one glyph pitch.',
  },
  {
    id: 'command-dock-identity-presentation',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'Default',
    claim:
      'Space, Map and Graph names share typography and each disclose that identity’s list; Rename in the list continues in the existing editor, and Escape hands the caret back to the name.',
  },
  {
    id: 'resources-popover-adds-existing-map-members',
    storyFile: 'surfaces/resources-popover.stories.tsx',
    storyExport: 'AvailableResources',
    claim:
      'The Resources list, anchored to its own trigger, draws each Resource absent from the Map as a titled row carrying its kind glyph and a drag grip, and activates an existing Resource through the application Add to Map path.',
  },
  {
    id: 'resources-popover-opens-and-dismisses-without-locking-the-canvas',
    storyFile: 'surfaces/resources-popover.stories.tsx',
    storyExport: 'AvailableResources',
    claim:
      'The Resources list opens anchored to its own trigger, dismisses on Escape with focus returning to that trigger, and leaves the surface behind it both live and undismissing — which is what dropping a Resource onto the canvas is.',
  },
  {
    id: 'resources-popover-keeps-the-reader-in-the-list-after-a-keyboard-add',
    storyFile: 'surfaces/resources-popover.stories.tsx',
    storyExport: 'AvailableResources',
    claim:
      'A keyboard Add leaves the Resources list open and puts the caret back in its filter, rather than following the placed Resource onto the canvas — so adding several Resources costs one disclosure.',
  },
  {
    id: 'resources-popover-offers-the-meta-spaces-beside-the-resources',
    storyFile: 'surfaces/resources-popover.stories.tsx',
    storyExport: 'MetaSpaces',
    claim:
      'The Resources list offers the Meta Space’s Spaces interleaved with this Space’s Resources, each row carrying the glyph that says which it is, and the Spaces toggle takes them away without touching the Resources.',
  },
  {
    id: 'resources-popover-drags-a-space-onto-the-canvas',
    storyFile: 'surfaces/resources-popover.stories.tsx',
    storyExport: 'MetaSpaces',
    claim:
      'A Space row carries the drag grip and a tooltip naming both gestures, and dropping it on the canvas places that Space — authoring the Space Resource that frames it at the drop point — while the list that started the drag stays open to take its answer.',
  },
  {
    id: 'resources-popover-counts-what-each-filter-contributes',
    storyFile: 'surfaces/resources-popover.stories.tsx',
    storyExport: 'AvailableResources',
    claim:
      'Each filter switch draws its glyph beside the number of rows it is contributing under the current search — including zero, and including a switch the reader has turned off — and the count moves with the search rather than reporting what the Space holds.',
  },
  {
    id: 'resources-popover-marks-where-else-a-resource-is-placed',
    storyFile: 'surfaces/resources-popover.stories.tsx',
    storyExport: 'PlacedElsewhere',
    claim:
      'A Resource the Map leaves out carries one capsule per other Map that places it, holding a dot for each of that Map’s Graphs with an Edge at it; hovering or focusing the row names each Map and its Graphs, and the row’s accessible description says the same.',
  },
  {
    id: 'resources-popover-distinguishes-an-empty-map',
    storyFile: 'surfaces/resources-popover.stories.tsx',
    storyExport: 'Empty',
    claim: 'A Map containing every Space Resource names that empty Resources View explicitly.',
  },
  {
    id: 'resources-popover-scrolls-a-long-list-on-a-narrow-screen',
    storyFile: 'surfaces/resources-popover.stories.tsx',
    storyExport: 'LongList',
    claim:
      'A long Resources list remains searchable and independently scrollable inside the viewport on a narrow screen.',
  },
  {
    id: 'resources-popover-withdraws-while-authoring-is-unavailable',
    storyFile: 'surfaces/resources-popover.stories.tsx',
    storyExport: 'Disabled',
    claim:
      'The Resources trigger is disabled while the Map cannot accept membership edits — presenting, an open Resource, or Reference Resource creation.',
  },
  {
    id: 'resources-popover-keeps-an-add-refusal-on-its-surface',
    storyFile: 'surfaces/resources-popover.stories.tsx',
    storyExport: 'Refused',
    claim: 'A refused Add remains visible in the open Resources list that asked for it.',
    applicationEvidence:
      'No browser gesture reaches a repeated Add. Completing the first one removes the Resource from `resourcesOutsideSelectedMap`, so the row unmounts before a second click can land on it, and only two events dispatched inside one task reach the refusal at all. The story is driven to the state instead, through the production Authoring composition, so the sentence it draws is the one `describeAuthoringRefusal` gives the application.',
  },
  {
    id: 'resources-popover-coexists-with-persistence-failure',
    storyFile: 'surfaces/resources-popover.stories.tsx',
    storyExport: 'PersistenceFailure',
    claim:
      'A failed membership save leaves the Resources list available beside the standing retryable persistence notice.',
  },
  {
    id: 'canvas-resource-fills-authored-node-rect',
    storyFile: 'components/resource.stories.tsx',
    storyExport: 'ResizeControl',
    claim:
      'The production CanvasResource fills a React Flow node whose authored rect differs from the collapsed default.',
  },
  {
    id: 'open-resource-offers-one-resize-control',
    storyFile: 'components/resource.stories.tsx',
    storyExport: 'ResizeControl',
    claim:
      'Every Open Resource exposes one bottom-right resize control revealed by hover, selection or focus, and a Closed Resource exposes none.',
  },
  {
    id: 'resize-preview-snaps-to-closed-rect',
    storyFile: 'components/resource.stories.tsx',
    storyExport: 'ResizeControl',
    claim:
      'A resize proposal entering the complete Close range previews the exact Closed rect while the active gesture still owns an Open Resource.',
  },
  {
    id: 'active-resource-resize-tracks-pointer-without-dimension-animation',
    storyFile: 'components/resource.stories.tsx',
    storyExport: 'ResizeControl',
    claim:
      'An active Resource resize applies each proposed width and height directly, without animating either dimension behind the pointer.',
  },
  {
    id: 'markdown-resource-opens-and-closes-in-place',
    storyFile: 'components/resource.stories.tsx',
    storyExport: 'OpenAndClose',
    claim:
      'A Markdown Resource opens and closes inside its production React Flow node with authoring handles present, retaining one Resource and Title treatment; its content fades out inertly before unmounting while its Title stays bottom-anchored for the whole closing motion.',
  },
  {
    id: 'open-markdown-resource-owns-its-editing-lifecycle',
    storyFile: 'components/resource-editing.stories.tsx',
    storyExport: 'Markdown',
    claim:
      'An open Markdown Resource begins editing from its rendered body or rail without a second visible affordance, keeps blur inert, and ends through Save, Cancel, Escape or Mod-Enter while Close remains disabled.',
  },
  {
    id: 'canvas-resource-exposes-kind-and-keyboard-actions',
    storyFile: 'components/resource.stories.tsx',
    storyExport: 'Actions',
    claim:
      'The production canvas Resource exposes Reference Resource identity and keyboard-focusable actions.',
  },
  {
    id: 'canvas-resource-shows-rest-selected-and-dragging-states',
    storyFile: 'components/resource.stories.tsx',
    storyExport: 'States',
    claim:
      'Rest, selected and dragging are visually distinct states for both the Markdown and Reference Resource front.',
    // React Flow's own selection/dragging booleans, and ResourceNode's translation
    // of them into CanvasResource's four-value `state`, are unit-tested directly
    // (`ResourceNode.test.tsx`, "translates React Flow selection and dragging into
    // shared visual states"). Dragging a real Resource is exercised throughout
    // `editing.spec.ts`'s drag-and-drop coverage, and selection through
    // `canvas-resource-exposes-kind-and-keyboard-actions`'s own application
    // evidence above. What this story adds beyond those is the *visual*
    // pairing of state with treatment (box-shadow ring, rotated drop shadow)
    // side by side for review — and it renders through `CanvasResourceSpecimen`,
    // a thin pass-through to the shipped `CanvasResource`, so there is no
    // facsimile that could drift from what the translated state actually
    // draws.
    applicationEvidence:
      'React Flow selection/dragging and their translation into state are covered by ResourceNode.test.tsx and by editing.spec.ts drag coverage; selection is also exercised by canvas-resource-exposes-kind-and-keyboard-actions. This story renders the shipped CanvasResource through CanvasResourceSpecimen (no facsimile) to pin the visual treatment per state for review, which is not itself a distinct browser-observable product behaviour beyond those.',
  },
  {
    id: 'canvas-resource-front-draws-only-its-title-lines',
    storyFile: 'components/resource.stories.tsx',
    storyExport: 'Front',
    claim:
      'Every Resource front draws its kind glyph, its border treatment and one element per Title Line at the role the domain gave it — and draws nothing beneath the Title but the Title Lines the author typed.',
  },
  {
    id: 'canvas-resource-shows-kind-treatment',
    storyFile: 'components/resource.stories.tsx',
    storyExport: 'Kinds',
    claim:
      "A Reference Resource front's dotted border and redraw glyph, and a long Markdown title's three-line clamp, are the kind's own presentation.",
  },
  {
    // **The former coloured-rail claim, changed rather than dropped.**
    // It read "a selected Resource's rail carries the Active Graph's own colour",
    // which was true and is now deliberately false: the rail is neutral and the
    // commands on it are the Command Dock's own surface
    // (`.scratch/command-dock/issues/12`). The claim keeps the palette sweep,
    // because what has to hold at every colour is the *opposite* of what it used
    // to be — and adds the half that says where the colour went.
    id: 'canvas-resource-toolbar-is-neutral-and-graph-colour-stays-on-connections',
    storyFile: 'components/resource.stories.tsx',
    storyExport: 'Colours',
    claim:
      "A selected Resource's commands are drawn on the same neutral command surface as the Command Dock at every Active Graph colour, while the Resource's authoring handles and its Edges keep that colour.",
  },
  {
    id: 'dragged-resource-returns-its-chrome-to-rest',
    storyFile: 'components/resource.stories.tsx',
    storyExport: 'Drag',
    claim:
      'A Resource being moved draws as dragging and reveals none of its chrome — no toolbar and no Edge handles — though the pointer is still on it and the drag has Selected it; on release its toolbar is drawn again and hovering it reveals its handles.',
  },
  {
    id: 'canvas-resource-hover-reveals-handles-and-selection-draws-commands',
    storyFile: 'components/resource.stories.tsx',
    storyExport: 'Hover',
    claim:
      "Hovering the real React Flow node reveals the adapter's Edge handles and none of CanvasResource's commands; selecting it draws its commands in React Flow's NodeToolbar.",
  },
  {
    id: 'canvas-resource-owns-title-editing-and-refusal',
    storyFile: 'components/resource-editing.stories.tsx',
    storyExport: 'Title',
    claim:
      "The canvas Resource's displayed Title is a named pointer and keyboard control that opens its field with the value selected, keeps a refused draft field-local, completes on Enter and cancels on Escape.",
  },
  {
    id: 'two-space-resources-draw-one-target-at-their-own-selections',
    storyFile: 'surfaces/space-resource-embedded-map.stories.tsx',
    storyExport: 'TwoSelectionsOfOneTarget',
    claim:
      'Two Space Resources referencing one Space each draw the Map they store rather than the target\u2019s own opening Map, so their embeddings differ in membership while converging on one Space.',
    // Both Space Resources can be authored in a browser, but only against a target
    // that owns two Maps \u2014 and a second Map is Add Map, which acts
    // on the Space the author is *in*. Entering that Space is the rail command
    // `space-cards/11` owns. The remaining gap is a target that already owns
    // two Maps, not the absence of Enter \u2014 the e2e fixture does not author
    // that second Map through the browser \u2014 so the claim takes the
    // documented exemption meanwhile.
    applicationEvidence:
      'A second Map in the target is Add Map from inside that Space. Entering a Space Resource is now the rail command `space-cards/11` owns, but this claim still needs a target that already owns two Maps — the e2e fixture does not author that second Map through the browser. `packages/app/test/space-resource-authoring.test.tsx` proves two Space Resources keeping their own selections through the application path meanwhile, and `test/support/repository-contract.ts` proves the pair survives the aggregate round trip.',
  },
  {
    id: 'space-resource-offers-enter',
    storyFile: 'components/resource.stories.tsx',
    storyExport: 'EnterSpace',
    claim:
      'A Space Resource offers Enter in its entity menu; activating it is the crossing that adds the target to Open Spaces and shows that Space.',
  },
  {
    id: 'space-resource-opens-independently',
    storyFile: 'components/resource.stories.tsx',
    storyExport: 'OpenIndependently',
    claim:
      'A Space Resource offers Copy Space link and Open in new tab for the Space it shows, at that Space’s own address and with no containing Map or presentation.',
  },
  {
    id: 'open-reference-shows-target-markdown-read-only',
    storyFile: 'components/resource.stories.tsx',
    storyExport: 'OpenReference',
    claim:
      'An Open Reference Resource keeps its own Title, renders its Target Markdown read-only, and offers Close without Target or source-edit controls.',
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
   * **Two obligations left rather than moved.** A Resource's Copy link to Resource
   * in Map, Copy link to Resource and Delete from Space belong to the Resource
   * rail (ADR 0073) and not to this surface — the Dock's organising rule is
   * that a Resource's own commands are absent — so
   * `space-sidebar-copies-resource-destinations` and
   * `space-sidebar-entity-actions-menu` have no successor here. The menu's own
   * successor is `canvas-resource-actions-menu`, claimed against the rail's
   * stable `Components/Resource` story; the copied destinations keep their
   * browser evidence in `space-routing.spec.ts` untagged.
   *
   * **And one was retired rather than restated.** `space-sidebar-shows-pending-
   * persistence` claimed a pending commit is exposed as saving. Ticket `01`
   * settled that the Dock carries no resting cue at all — a commit settles
   * faster than a dot can be read — so `PersistenceIndicator` is never called
   * from here and there is nothing left to claim.
   */
  {
    id: 'command-dock-marks-one-current-map',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'Default',
    claim:
      "Exactly one authored Map is the one drawing the canvas, chosen from the Map cluster's single exclusive list, which names the chosen one on the cluster itself.",
  },
  {
    id: 'command-dock-adds-an-empty-map',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'Default',
    claim:
      'New Map sits in the Map menu beside the list it adds to, and creates and selects an empty Map without implicitly placing Resources.',
  },
  {
    id: 'command-dock-adds-graph',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'Default',
    claim:
      'New Graph sits in the Graph menu beside the list it adds to, and appends, colours and activates one empty Graph in one Edit.',
  },
  {
    id: 'command-dock-recolors-graph',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'Default',
    claim:
      "The Graph menu's Colour submenu offers the application's palette and stores the chosen colour on the active Graph.",
  },
  {
    id: 'command-dock-deletes-graph',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'Default',
    claim:
      'Delete Graph removes the active Graph when the Map owns more than one, and is present but unavailable on the last Graph the Map keeps.',
  },
  {
    id: 'command-dock-copies-graph-destinations',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'Default',
    claim:
      'The Graph menu offers Copy link to Graph, building the current-Map address, and offers no permanent address of its own.',
  },
  {
    id: 'command-dock-recolors-graph-through-swatch-picker',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'Default',
    claim:
      'Colour… in the Graph menu opens a palette-bound swatch grid offering every Tableau Classic 20 slot, each named in its accessible label; choosing one recolours the Active Graph.',
  },
  {
    id: 'palette-color-picker-chooses-a-closed-palette-colour',
    storyFile: 'components/palette-color-picker.stories.tsx',
    storyExport: 'Default',
    claim:
      'A closed palette opens as a swatch grid in a popover; the chosen swatch is visibly selected and choosing one invokes the caller and closes the popover.',
    applicationEvidence:
      'The Command Dock embeds the shared `PaletteColorSwatchGrid` for Graph recolour in a submenu; this story covers the popover wrapper. `command-dock-recolors-graph-through-swatch-picker` in editing.spec.ts exercises recolour through the real authoring stack.',
  },
  {
    id: 'command-dock-edits-identity-names',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'Default',
    claim:
      'The Space, Map and Graph names each disclose that identity’s list; Rename in the list continues in the existing in-place editor as one refusable draft that keeps a refusal on the field, completes on Enter and cancels on Escape.',
  },
  {
    id: 'command-dock-marks-the-space-one-crossing-up',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'Default',
    claim:
      'A Space entered from another names that one Space as its Opener, marked with OPEN, and holds every other open Space behind the Open Spaces disclosure beside it. The Spaces trigger draws OPEN, and the Space you are in draws a cube whichever Space it is, Meta included.',
  },
  {
    id: 'command-dock-keeps-its-names-on-a-side-edge',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'DockedLeft',
    claim:
      'Docked to a side edge the surface is a column of named rows rather than a rail of glyphs, and its disclosures open away from that edge into the canvas.',
  },
  {
    id: 'command-dock-always-reaches-meta',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'NewSpace',
    claim:
      'The Open Spaces menu is drawn in every Space and lists the Meta Space first by its own title, marked with OPEN, with a cube on every other open Space, and choosing it opens Meta even when Meta is not open.',
  },
  {
    id: 'command-dock-names-a-new-spaces-initial-map-and-graph',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'NewSpace',
    claim:
      'A new Space names its initial Map and its empty Active Graph rather than leaving either cluster blank, and cannot present.',
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
    id: 'command-dock-reports-aggregate-refusal',
    storyFile: 'space/command-dock.stories.tsx',
    storyExport: 'SaveRefused',
    claim:
      'A refused aggregate — a distinct persistence state from permanent rejection — explains the reason as one sentence and can be acknowledged, with no retry offered.',
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
    claim: 'A sink announces the end of the Graph and Back recovers the Resource before it.',
  },
  {
    id: 'presenting-narrow-keeps-choices-and-controls',
    storyFile: 'components/presenting-chrome.stories.tsx',
    storyExport: 'Narrow',
    claim: 'A narrow chrome keeps the choices in their own row above Back, guidance and Overview.',
  },
  {
    id: 'operational-feedback-startup-pending',
    storyFile: 'components/operational-feedback.stories.tsx',
    storyExport: 'Starting',
    claim:
      'Startup draws the product mark over one announced “Starting…”, from first paint until the opened Space replaces it.',
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
      'Selectable V1 Maps use the in-process positioned strategy, which cannot reject, so no application flow reaches a failed placement. The failed state becomes the failure diagnostic in packages/app/test/canvas-content.test.ts.',
  },
  {
    id: 'operational-feedback-placement-pending',
    storyFile: 'components/operational-feedback.stories.tsx',
    storyExport: 'Arranging',
    claim: 'The canvas shows a busy state while a strategy is still arranging Resources.',
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
      'The endpoint editor names both endpoints, completes on the Resource chosen, and dismisses its list then itself on Escape.',
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
    claim: 'A stale Map, Graph or Edge reports on the form channel and marks neither Field.',
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
    id: 'open-space-resource-draws-its-selected-map',
    storyFile: 'surfaces/space-resource-embedded-map.stories.tsx',
    storyExport: 'SelectedMap',
    claim:
      "An Open Space Resource draws the Map it selects — the target Space's own Resources and the one Graph across them — as sub-flow children of the containing canvas, whose measured boxes stay inside the Space Resource's own rect.",
  },
  {
    id: 'resource-toolbar-floats-above-its-corner',
    storyFile: 'surfaces/space-resource-embedded-map.stories.tsx',
    storyExport: 'SelectedMap',
    claim:
      "A selected Resource's toolbar floats above its top-right corner, outside the Resource and clear of its top anchor, at the Command Dock's control size whatever the zoom, and stays operable above an Open Space Resource's embedded content.",
  },
  {
    id: 'space-resource-content-sized-footer',
    storyFile: 'surfaces/space-resource-embedded-map.stories.tsx',
    storyExport: 'SelectedMap',
    claim:
      'The Space Resource title footer grows with title content and the embedded Map clips at its measured edge.',
  },
  {
    id: 'space-resource-canvas-padding',
    storyFile: 'surfaces/space-resource-embedded-map.stories.tsx',
    storyExport: 'SelectedMap',
    claim: 'Embedded Resources drag against equal top, left and right canvas padding.',
  },
  {
    id: 'space-resource-entity-menu',
    storyFile: 'surfaces/space-resource-embedded-map.stories.tsx',
    storyExport: 'SelectedMap',
    claim:
      'Space Resource entity menus group Create Reference, Enter and independent opening, three concise copy links, and removal — Rename is absent, the Title editing on the Resource front instead; creating a Reference Resource shows the selected target Map read-only.',
  },
  {
    id: 'space-resource-context-menus-share-dock-actions',
    storyFile: 'surfaces/space-resource-embedded-map.stories.tsx',
    storyExport: 'SelectedMap',
    claim:
      "Space Resource Map and Graph menus share the Dock's grouping grammar and commands and author the target — New, Colour, Rename, Copy link to Map or Copy link to Graph, and Delete, grouped and separated the same way — without navigating the containing Space.",
  },
  {
    id: 'open-space-resource-chooses-its-context-on-the-shared-controls',
    storyFile: 'surfaces/space-resource-embedded-map.stories.tsx',
    storyExport: 'SelectedMap',
    claim:
      "An Open Space Resource's Map and Graph choices extend its one rail toolbar with the Command Dock's shared clusters, controls and lists; arrows traverse them alongside entity actions and Close, and choosing one writes the Resource's stored context without moving the containing Space.",
  },
  {
    id: 'open-space-resource-drag-keeps-embedded-map-aligned',
    storyFile: 'surfaces/space-resource-embedded-map.stories.tsx',
    storyExport: 'SelectedMap',
    claim:
      'Dragging an Open Space Resource translates its embedded Resources and Graph connectors as one aligned drawing throughout the gesture, without delayed catch-up after release.',
  },
  {
    id: 'embedded-map-resources-author-target',
    storyFile: 'surfaces/space-resource-embedded-map.stories.tsx',
    storyExport: 'SelectedMap',
    claim:
      'Editing a Resource inside an Open Space Resource authors its target Space and updates both canvases; Edit offers the same connection handles as the host canvas, and those handles author the Graph the Space Resource is showing rather than a cross-Space Edge.',
  },
  {
    id: 'space-resource-portal-read-edit',
    storyFile: 'surfaces/space-resource-embedded-map.stories.tsx',
    storyExport: 'SelectedMap',
    claim:
      'An Open Space Resource offers Edit and Done on its floating dock; Read keeps the embedding inert so dragging moves the containing Resource, and Edit makes the embedded canvas interactive without a second command surface.',
  },
  {
    id: 'space-resource-portal-framing',
    storyFile: 'surfaces/space-resource-embedded-map.stories.tsx',
    storyExport: 'EnteredFromSpaceResource',
    claim:
      'A Space Resource stores camera framing independently of other Resources on the same target; Done, Close, reopen and Return restore it, Enter uses the browser-sized canvas rather than the source Resource rectangle, Map fallback clears framing and Graph fallback keeps it.',
  },
  {
    id: 'space-resource-portal-edit-is-the-host-canvas',
    storyFile: 'surfaces/space-resource-embedded-map.stories.tsx',
    storyExport: 'SelectedMap',
    claim:
      'Portal Edit frames authored coordinates without stretching a Resource flow-pixel size; a Resource that leaves the window is clipped to it and never paints on the containing canvas after zoom-out.',
  },
  {
    id: 'space-resource-portal-independent-framing',
    storyFile: 'surfaces/space-resource-embedded-map.stories.tsx',
    storyExport: 'TwoSelectionsOfOneTarget',
    claim:
      'Two Space Resources selecting the same target author framing independently of each other.',
    applicationEvidence:
      'Two Space Resources on one two-Map target is the Ladle fixture; the e2e fixture does not author that pair through the browser. packages/app/ladle-e2e/space-resource-embedded-map.spec.ts holds the independent-framing proof, and packages/app/e2e/space-resource.spec.ts covers persistence, reload, Enter/Return and Map/Graph fallback on one Space Resource.',
  },
  {
    id: 'graph-hud-and-dock-agree-on-the-active-graph',
    storyFile: 'surfaces/graph-hud.stories.tsx',
    storyExport: 'Retained',
    claim:
      'The canvas HUD names the current Space and open Map read-only, keys every Graph that Map owns and emphasises the active one, attached above a real MiniMap.',
  },
  {
    id: 'graph-hud-key-hands-back-the-pointers-it-does-not-need',
    storyFile: 'surfaces/graph-hud.stories.tsx',
    storyExport: 'Retained',
    claim:
      'The canvas HUD’s key panel presses nothing, so a pointer over it reaches the canvas beneath rather than being swallowed by the Panel in the corner a Resource’s resize control lives in — while the two clipped identity names keep the pointer, because their title is the only place a truncated name can be read.',
  },
  {
    id: 'graph-hud-key-follows-the-open-map',
    storyFile: 'surfaces/graph-hud.stories.tsx',
    storyExport: 'SparseMap',
    claim:
      'The canvas HUD keys the Graphs of the Map it opens on, not the Graphs of the Space: a Map that owns one Graph draws a key of one, and the Graphs another Map owns are absent from it rather than dimmed.',
  },
] as const;
