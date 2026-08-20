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
] as const;
