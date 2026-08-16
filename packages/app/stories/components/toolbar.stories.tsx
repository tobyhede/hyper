import type { ReactNode } from 'react';
import type { Story } from '@ladle/react';
import { WorkspaceToolbarFixture } from '../support/WorkspaceToolbarFixture';

export default { title: 'Components/Workspace Toolbar' };

const ToolbarRow = ({ children }: { readonly children: ReactNode }) => (
  <div className="shell__header">
    <div className="shell__toolbar">{children}</div>
  </div>
);

export const Settled: Story = () => (
  <ToolbarRow>
    <WorkspaceToolbarFixture />
  </ToolbarRow>
);

export const Pending: Story = () => (
  <ToolbarRow>
    <WorkspaceToolbarFixture persistence="pending" />
  </ToolbarRow>
);

export const Presenting: Story = () => (
  <ToolbarRow>
    <WorkspaceToolbarFixture presenting authoringDisabled />
  </ToolbarRow>
);
