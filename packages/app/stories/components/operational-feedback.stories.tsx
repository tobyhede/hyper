import type { Story } from '@ladle/react';
import { PlacementFailure } from '#components/PlacementFailure';
import { PlacementPending } from '#components/PlacementPending';
import { StartupFailure } from '#components/StartupFailure';
import { WorkspaceFailureView } from '#components/WorkspaceFailureView';

export default { title: 'Components/Operational Feedback' };

/** What the whole app renders when it cannot start at all. */
export const Startup: Story = () => (
  <StartupFailure message="Space document version 2 is not supported; this build reads version 1" />
);

/** What `WorkspaceFailure`'s error boundary renders when the mounted app throws. */
export const Workspace: Story = () => (
  <WorkspaceFailureView message="Graph names an absent card 00000000-0000-4000-8000-000000000005" />
);

/** The canvas when no strategy produced positions for the active Layout. */
export const Placement: Story = () => (
  <PlacementFailure error={new Error('No position for Card A')} />
);

/** The canvas while a strategy is still arranging Cards. */
export const Arranging: Story = () => <PlacementPending />;
