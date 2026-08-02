import type { ReactElement } from 'react';

/**
 * The one surface that reports a workspace that cannot be shown.
 *
 * Two callers reach it and they arrive by different routes, which is why it is a
 * plain component rather than markup inside the error boundary: the boundary
 * catches a *render* throw, while remote acceptance rejects an unloadable
 * snapshot from an `onClick` handler, where no boundary ever runs. Both need the
 * same panel, so neither owns it.
 *
 * It lives in its own module because `Workspace.tsx` exports `mountWorkspace`,
 * and a file mixing component and non-component exports loses React Fast Refresh.
 */
export function WorkspaceReport({ message }: { message: string }): ReactElement {
  return (
    <div className="placement-status" role="alert" data-testid="workspace-failure">
      <div className="placement-status__panel">
        <h2>Unable to open this space</h2>
        <pre>{message}</pre>
      </div>
    </div>
  );
}
