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
    id: 'markdown-card-opens-and-closes-in-place',
    storyFile: 'components/card.stories.tsx',
    storyExport: 'OpenAndClose',
    claim:
      'A Markdown Card opens and closes in place while retaining one Card and Title treatment.',
  },
  {
    id: 'open-markdown-card-owns-its-editing-lifecycle',
    storyFile: 'components/card-editing.stories.tsx',
    storyExport: 'Markdown',
    claim:
      'An open Markdown Card begins editing from its body or rail, keeps blur inert, and ends through Save, Cancel, Escape or Mod-Enter while Close remains disabled.',
  },
  {
    id: 'canvas-card-exposes-kind-and-keyboard-actions',
    storyFile: 'components/card.stories.tsx',
    storyExport: 'Actions',
    claim: 'The production canvas Card exposes Alias identity and keyboard-focusable actions.',
  },
  {
    id: 'canvas-card-shows-rest-selected-and-dragging-states',
    storyFile: 'components/card.stories.tsx',
    storyExport: 'States',
    claim:
      'Rest, selected and dragging are visually distinct states for both the Markdown and Alias front.',
    // React Flow's own selection/dragging booleans, and CardNode's translation
    // of them into CanvasCard's four-value `state`, are unit-tested directly
    // (`CardNode.test.tsx`, "translates React Flow selection and dragging into
    // shared visual states"). Dragging a real Card is exercised throughout
    // `editing.spec.ts`'s drag-and-drop coverage, and selection through
    // `canvas-card-exposes-kind-and-keyboard-actions`'s own application
    // evidence above. What this story adds beyond those is the *visual*
    // pairing of state with treatment (box-shadow ring, rotated drop shadow)
    // side by side for review — and it renders through `CanvasCardSpecimen`,
    // a thin pass-through to the shipped `CanvasCard`, so there is no
    // facsimile that could drift from what the translated state actually
    // draws.
    applicationEvidence:
      'React Flow selection/dragging and their translation into state are covered by CardNode.test.tsx and by editing.spec.ts drag coverage; selection is also exercised by canvas-card-exposes-kind-and-keyboard-actions. This story renders the shipped CanvasCard through CanvasCardSpecimen (no facsimile) to pin the visual treatment per state for review, which is not itself a distinct browser-observable product behaviour beyond those.',
  },
  {
    id: 'canvas-card-shows-kind-treatment',
    storyFile: 'components/card.stories.tsx',
    storyExport: 'Kinds',
    claim:
      "An Alias front's dotted border and redraw glyph, and a long Markdown title's three-line clamp, are the kind's own presentation.",
  },
  {
    id: 'canvas-card-shows-active-graph-colour',
    storyFile: 'components/card.stories.tsx',
    storyExport: 'Colours',
    claim: "A selected Card's rail carries the Active Graph's own colour.",
  },
  {
    id: 'canvas-card-hover-reveals-actions-and-handles-together',
    storyFile: 'components/card.stories.tsx',
    storyExport: 'Hover',
    claim:
      "Hovering the real React Flow node reveals CanvasCard's own rail actions and the adapter's Edge handles together.",
    // The two halves of this claim already have real application evidence
    // separately: hover revealing CanvasCard's rail actions is asserted in
    // `editing.spec.ts` ("inline title editing persists without moving or
    // opening the Card", `await card.hover(); ... toHaveCSS('opacity', '1')`
    // on the Edit control), and hover/selection revealing the adapter's
    // authoring handles is asserted in `overview.spec.ts` ("handles stay
    // measurable...") and unit-tested in CardNode.test.tsx. What this story
    // adds is mounting both through the same real `CardNode` in a real
    // `ReactFlow` instance side by side, which is exactly what
    // `CanvasCardNodeSpecimen` does — not a facsimile of
    // either half.
    applicationEvidence:
      "Hover revealing CanvasCard's rail actions is covered by editing.spec.ts (asserted on the `canvas-card-actions` container, which is where the reveal's opacity lives — `opacity` does not inherit, so the same assertion on a button could not fail); hover/selection revealing the adapter's authoring handles is covered by overview.spec.ts and CardNode.test.tsx. This story mounts the real CardNode in a real ReactFlow instance (CanvasCardNodeSpecimen, no facsimile) to show both together, which is not a distinct browser-observable behaviour beyond those two.",
  },
  {
    id: 'canvas-card-owns-title-editing-and-refusal',
    storyFile: 'components/card-editing.stories.tsx',
    storyExport: 'Title',
    claim:
      "The canvas Card's displayed Title is a named pointer and keyboard control that opens its field with the value selected, keeps a refused draft field-local, completes on Enter and cancels on Escape.",
  },
  {
    id: 'markdown-pane-refusal-is-field-local',
    storyFile: 'components/card-and-alias-panes.stories.tsx',
    storyExport: 'Markdown',
    claim: 'A refused Markdown Card title stays field-local and the whole draft can be cancelled.',
  },
  {
    id: 'markdown-source-editor-preserves-pane-ownership',
    storyFile: 'components/card-and-alias-panes.stories.tsx',
    storyExport: 'Markdown',
    claim:
      'The Markdown source editor preserves exact source while Tab remains focus navigation and Escape remains pane dismissal.',
  },
  {
    id: 'alias-pane-authors-metadata',
    storyFile: 'components/card-and-alias-panes.stories.tsx',
    storyExport: 'Alias',
    claim: 'An Alias opens its own title and Target editor without exposing Target content.',
  },
  {
    id: 'new-alias-completes-on-the-target-chosen',
    storyFile: 'components/card-and-alias-panes.stories.tsx',
    storyExport: 'NewAliasPane',
    // Deliberately says nothing about the title the pane carries. The Ladle test
    // types one and reads it back, but the application test exercises the empty
    // title that takes the Target's own (ADR 0049), so a clause about a typed
    // title would have one proof rather than the two ADR 0052 requires.
    claim:
      'Adding an Alias offers Title and Target with no create action, and completes on the Target chosen rather than on a second confirmation.',
  },
  {
    id: 'persistence-indicator-shows-save-lifecycle',
    storyFile: 'components/persistence-indicator.stories.tsx',
    storyExport: 'Lifecycle',
    claim: 'Persistence reports saving, briefly acknowledges success, then returns to rest.',
  },
  {
    id: 'space-sidebar-marks-one-current-renderer',
    storyFile: 'components/space-sidebar.stories.tsx',
    storyExport: 'Settled',
    claim: 'Exactly one computed View or authored Layout is the current renderer.',
  },
  {
    id: 'space-sidebar-names-unauthored-state',
    storyFile: 'components/space-sidebar.stories.tsx',
    storyExport: 'Unauthored',
    claim: 'An unauthored Space names its empty Layout and Graph groups and cannot present.',
  },
  {
    id: 'space-sidebar-shows-pending-persistence',
    storyFile: 'components/space-sidebar.stories.tsx',
    storyExport: 'Pending',
    claim: 'A pending commit is exposed as saving in the Space Sidebar.',
  },
  {
    id: 'space-sidebar-recovers-retryable-failure',
    storyFile: 'components/space-sidebar.stories.tsx',
    storyExport: 'Failed',
    claim: 'Retryable persistence failure keeps local work visible and offers retry.',
  },
  {
    id: 'space-sidebar-reports-permanent-rejection',
    storyFile: 'components/space-sidebar.stories.tsx',
    storyExport: 'Rejected',
    claim: 'Permanent persistence rejection explains the reason and can be acknowledged.',
  },
  {
    id: 'space-sidebar-resolves-conflict',
    storyFile: 'components/space-sidebar.stories.tsx',
    storyExport: 'Conflicted',
    claim: 'A revision conflict blocks dismissal until local or remote work is chosen.',
  },
  {
    id: 'space-sidebar-withdraws-authoring-while-presenting',
    storyFile: 'components/space-sidebar.stories.tsx',
    storyExport: 'Presenting',
    claim: 'Presenting replaces its entry action with Overview and withdraws authoring.',
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
    claim: 'A sink announces the end of the Graph and Back recovers the Card before it.',
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
    // `openStoredSpace` (initial load), Space Authoring's edit completion,
    // and the conflict accept/reload flow (`acceptStoredSpace` in
    // space-authoring.ts, guarding exactly this). Reaching this boundary means
    // an invariant already broke — see `SpaceApp.tsx`'s own doc comment — and
    // the only place that is exercised is `packages/app/test/SpaceApp.test.tsx`,
    // which opens a session directly with a pre-corrupted snapshot: an
    // internal API no browser-driven `packages/app/e2e` test can reach. There
    // is no legitimate user- or network-observable flow left to drive it
    // through the real app, so this claim is Ladle-only.
    applicationEvidence:
      'Unreachable through any current legitimate browser-driven flow — every production path that could install a bad working snapshot validates first (openStoredSpace, Space Authoring edit completion, conflict accept/reload). Covered instead by packages/app/test/SpaceApp.test.tsx, which reaches the boundary only via the internal openSpaceSession API.',
  },
  {
    id: 'operational-feedback-placement-failure',
    storyFile: 'components/operational-feedback.stories.tsx',
    storyExport: 'Placement',
    claim: 'A strategy that cannot produce positions fails placement with its own diagnostic.',
  },
  {
    id: 'operational-feedback-placement-pending',
    storyFile: 'components/operational-feedback.stories.tsx',
    storyExport: 'Arranging',
    claim: 'The canvas shows a busy state while a strategy is still arranging Cards.',
  },
  {
    id: 'selected-edge-controls-offer-edit-and-delete',
    storyFile: 'components/selected-edge-controls.stories.tsx',
    storyExport: 'Closed',
    claim: 'A selected Edge offers Edit and Delete, and only Edit opens the endpoint editor.',
  },
  {
    id: 'selected-edge-editor-shows-both-endpoints',
    storyFile: 'components/selected-edge-controls.stories.tsx',
    storyExport: 'EndpointEditor',
    claim:
      'The endpoint editor names both endpoints, completes on the Card chosen, and dismisses its list then itself on Escape.',
  },
  {
    id: 'selected-edge-endpoint-refusal-disables-its-choice',
    storyFile: 'components/selected-edge-controls.stories.tsx',
    storyExport: 'DisabledChoice',
    claim: 'An endpoint the Edit would refuse stays listed, disabled, with its reason.',
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
    claim: 'A stale Layout, Graph or Edge reports on the form channel and marks neither Field.',
    applicationEvidence:
      'The reachable stale conditions on a computed View disable every row before a reconnection can be proposed, and the rest need the Space to change under an open editor. Covered instead by packages/app/test/authoring-refusal.test.ts and packages/app/test/SelectedEdgeControls.test.tsx.',
  },
  {
    id: 'selected-edge-deletion-refusal-stays-on-its-controls',
    storyFile: 'components/selected-edge-controls.stories.tsx',
    storyExport: 'DeletionRefusal',
    claim: 'A refused Delete stays on the surviving selected-Edge controls.',
  },
  {
    id: 'graph-hud-and-sidebar-agree-on-the-active-graph',
    storyFile: 'surfaces/graph-hud.stories.tsx',
    storyExport: 'Retained',
    claim: 'The canvas HUD keys every Graph and emphasises the active one, beside a real MiniMap.',
  },
] as const;
