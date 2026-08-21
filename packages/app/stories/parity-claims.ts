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
    id: 'markdown-pane-refusal-is-field-local',
    storyFile: 'components/card-and-alias-panes.stories.tsx',
    storyExport: 'Markdown',
    claim: 'A refused Markdown Card title stays field-local and the whole draft can be cancelled.',
  },
  {
    id: 'alias-pane-authors-metadata',
    storyFile: 'components/card-and-alias-panes.stories.tsx',
    storyExport: 'Alias',
    claim: 'An Alias opens its own title and Target editor without exposing Target content.',
  },
  {
    id: 'persistence-indicator-shows-save-lifecycle',
    storyFile: 'components/persistence-indicator.stories.tsx',
    storyExport: 'Lifecycle',
    claim: 'Persistence reports saving, briefly acknowledges success, then returns to rest.',
  },
  {
    id: 'space-sidebar-marks-one-current-renderer',
    storyFile: 'components/workspace-sidebar.stories.tsx',
    storyExport: 'Settled',
    claim: 'Exactly one computed View or authored Layout is the current renderer.',
  },
  {
    id: 'space-sidebar-names-unauthored-state',
    storyFile: 'components/workspace-sidebar.stories.tsx',
    storyExport: 'Unauthored',
    claim: 'An unauthored Space names its empty Layout and Graph groups and cannot present.',
  },
  {
    id: 'space-sidebar-shows-pending-persistence',
    storyFile: 'components/workspace-sidebar.stories.tsx',
    storyExport: 'Pending',
    claim: 'A pending commit is exposed as saving in the Space Sidebar.',
  },
  {
    id: 'space-sidebar-recovers-retryable-failure',
    storyFile: 'components/workspace-sidebar.stories.tsx',
    storyExport: 'Failed',
    claim: 'Retryable persistence failure keeps local work visible and offers retry.',
  },
  {
    id: 'space-sidebar-reports-permanent-rejection',
    storyFile: 'components/workspace-sidebar.stories.tsx',
    storyExport: 'Rejected',
    claim: 'Permanent persistence rejection explains the reason and can be acknowledged.',
  },
  {
    id: 'space-sidebar-resolves-conflict',
    storyFile: 'components/workspace-sidebar.stories.tsx',
    storyExport: 'Conflicted',
    claim: 'A revision conflict blocks dismissal until local or remote work is chosen.',
  },
  {
    id: 'space-sidebar-withdraws-authoring-while-presenting',
    storyFile: 'components/workspace-sidebar.stories.tsx',
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
    id: 'operational-feedback-workspace-failure',
    storyFile: 'components/operational-feedback.stories.tsx',
    storyExport: 'Workspace',
    claim:
      "Workspace's error boundary reports a mounted app's render throw instead of leaving a blank page.",
    // Every production write path that could hand `App` a bad working
    // snapshot validates first and refuses inline rather than installing it:
    // `openStoredWorkspace` (initial load), Space Authoring's edit completion,
    // and the conflict accept/reload flow (`acceptStoredSpace` in
    // space-authoring.ts, guarding exactly this). Reaching this boundary means
    // an invariant already broke — see `Workspace.tsx`'s own doc comment — and
    // the only place that is exercised is `packages/app/test/Workspace.test.tsx`,
    // which opens a session directly with a pre-corrupted snapshot: an
    // internal API no browser-driven `packages/app/e2e` test can reach. There
    // is no legitimate user- or network-observable flow left to drive it
    // through the real app, so this claim is Ladle-only.
    applicationEvidence:
      'Unreachable through any current legitimate browser-driven flow — every production path that could install a bad working snapshot validates first (openStoredWorkspace, Space Authoring edit completion, conflict accept/reload). Covered instead by packages/app/test/Workspace.test.tsx, which reaches the boundary only via the internal openSpaceSession API.',
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
