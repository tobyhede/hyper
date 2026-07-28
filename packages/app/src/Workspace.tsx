import type { ReactElement } from 'react';
import { loadSpaceSnapshot } from '@project/graph';
import { createApp } from './App';
import type { OpenedSpace } from './space';

export type WorkspaceRenderer = (app: ReactElement) => void;

/** Mount a workspace-local app, replacing every derived store after remote acceptance. */
export function mountWorkspace(opened: OpenedSpace, render: WorkspaceRenderer): void {
  const acceptRemote = () => {
    opened.spaceSession.acceptRemote();
    const accepted = loadSpaceSnapshot(opened.spaceSession.getState().working);
    if (!accepted.ok) {
      throw new Error(
        `The accepted remote space is invalid:\n${accepted.errors
          .map((error) => `  - ${error.message}`)
          .join('\n')}`,
      );
    }
    mountWorkspace({ space: accepted.space, spaceSession: opened.spaceSession }, render);
  };
  const App = createApp(opened, { acceptRemote });
  render(<App />);
}
