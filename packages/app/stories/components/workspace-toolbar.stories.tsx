import type { ReactNode } from 'react';
import type { Story } from '@ladle/react';
import { uuidSchema } from '@project/core';
import {
  RetryableWorkspaceToolbarFixture,
  WorkspaceToolbarFixture,
} from '../support/WorkspaceToolbarFixture';

export default { title: 'Components/Workspace Toolbar' };

const ToolbarRow = ({ children }: { readonly children: ReactNode }) => (
  <div className="shell__header">
    <h1 className="shell__title">Workspace</h1>
    <div className="shell__toolbar">{children}</div>
  </div>
);

const story = (children: ReactNode) => <ToolbarRow>{children}</ToolbarRow>;

export const Settled: Story = () => story(<WorkspaceToolbarFixture />);
export const Pending: Story = () =>
  story(<WorkspaceToolbarFixture persistence={{ kind: 'pending' }} />);
export const Failed: Story = () => story(<RetryableWorkspaceToolbarFixture />);
export const Rejected: Story = () =>
  story(
    <WorkspaceToolbarFixture
      persistence={{
        kind: 'rejected',
        failure: { kind: 'permanent-failure', code: 'forbidden', message: 'Permission denied' },
      }}
    />,
  );
Rejected.meta = { iframed: true };
export const Conflicted: Story = () =>
  story(
    <WorkspaceToolbarFixture
      persistence={{
        kind: 'conflicted',
        current: {
          snapshot: {
            id: uuidSchema.parse('00000000-0000-4000-8000-000000000005'),
            document: { version: 1, title: 'Remote workspace' },
            cards: [],
          },
          revision: 5n,
          exportedRevision: null,
        },
      }}
      remoteRefusal="The remote space is invalid and was not accepted."
    />,
  );
Conflicted.meta = { iframed: true };
export const Presenting: Story = () =>
  story(<WorkspaceToolbarFixture presenting authoringDisabled />);
