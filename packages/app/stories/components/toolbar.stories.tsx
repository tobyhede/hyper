import type { ReactNode } from 'react';
import type { Story } from '@ladle/react';
import { Toolbar } from '../support/Toolbar';

export default { title: 'Components/Toolbar' };

const ToolbarRow = ({ children }: { readonly children: ReactNode }) => (
  <div className="shell__header">
    <div className="shell__toolbar">{children}</div>
  </div>
);

export const Settled: Story = () => (
  <ToolbarRow>
    <Toolbar />
  </ToolbarRow>
);

export const Pending: Story = () => (
  <ToolbarRow>
    <Toolbar persistence="pending" />
  </ToolbarRow>
);

export const Presenting: Story = () => (
  <ToolbarRow>
    <Toolbar presenting authoringDisabled />
  </ToolbarRow>
);
