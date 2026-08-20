export const parityClaims = [
  {
    id: 'markdown-pane-refusal-is-field-local',
    storyFile: 'components/card-and-alias-panes.stories.tsx',
    storyExport: 'Markdown',
    claim: 'A refused Markdown Card title stays field-local and the whole draft can be cancelled.',
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
] as const;
